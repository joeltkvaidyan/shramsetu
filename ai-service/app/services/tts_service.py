"""Text-to-speech — AI4Bharat IndicParler-TTS (primary), Meta MMS VITS (fallback).

Primary engine: `ai4bharat/indic-parler-tts` — the Indic extension of
Parler-TTS Mini speaking 20+ Indian languages plus English. Gated on
Hugging Face (auto-approval; needs HF_TOKEN), ~3.75 GB, needs the
`parler-tts` package and espeak-ng for phonemization.

Fallback engine: `facebook/mms-tts-*` (VITS) — a ~150 MB local model per
language, no extra system deps. It keeps /speak answering when Parler
cannot load (gate not accepted, espeak-ng missing, RAM pressure), so the
voice feature degrades instead of dying.

Everything runs on this box: no API keys, no network calls at synthesis
time. Parler loads LAZILY on the first /speak (never at boot — 3.75 GB of
weights next to whisper + IndicTrans2 would starve an 8 GB box);
prewarm() warms only the English MMS model so there is always an instant
answer path.

Output contract is unchanged: WAV bytes, PCM 16-bit mono, media type
audio/wav (one sample rate per response — Parler ~44.1 kHz, MMS 16 kHz).
"""
from __future__ import annotations

import io
import logging
import re
import threading
import wave

from app.core.config import settings

logger = logging.getLogger("shramsetu.tts")

_MAX_TTS_CHARS = 5000
# Parler is autoregressive: long single inputs degrade prosody and grow
# latency super-linearly. Sentence-pack at this size (Parler), larger for MMS.
_PARLER_CHUNK_CHARS = 200
_MMS_CHUNK_CHARS = 300

# ── Engine 1: IndicParler-TTS ──────────────────────────────────────────────

# Voice descriptions (Parler conditions on a natural-language voice prompt;
# the description stays English — that is the Parler convention — and names
# the target language the way the model card's examples do).
_PARLER_VOICE: dict[str, str] = {
    "en": "A female speaker with a calm, clear Indian accent speaks English slowly and warmly.",
    "hi": "A female speaker delivers a clear and expressive performance in fluent Hindi.",
    "bn": "A female speaker delivers a clear and expressive performance in fluent Bengali.",
    "ta": "A female speaker delivers a clear and expressive performance in fluent Tamil.",
    "te": "A female speaker delivers a clear and expressive performance in fluent Telugu.",
    "ml": "A female speaker delivers a clear and expressive performance in fluent Malayalam.",
}

_parler_lock = threading.Lock()
_parler: tuple | None = None  # (model, tokenizer, description_tokenizer)


def _get_parler() -> tuple:
    """Lazily load IndicParler-TTS once (model + both tokenizers)."""
    global _parler
    if _parler is not None:
        return _parler
    with _parler_lock:
        if _parler is not None:
            return _parler
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        name = settings.TTS_MODEL
        logger.info("TTS: loading IndicParler-TTS (%s) — first load downloads ~3.75 GB", name)
        model = ParlerTTSForConditionalGeneration.from_pretrained(name).eval()
        tokenizer = AutoTokenizer.from_pretrained(name)
        desc_name = model.config.text_encoder._name_or_path
        desc_tokenizer = AutoTokenizer.from_pretrained(desc_name)
        _parler = (model, tokenizer, desc_tokenizer)
        logger.info("TTS: IndicParler-TTS resident")
        return _parler


def _synthesize_parler(text: str, language: str) -> tuple[bytes, int]:
    """Synthesize with IndicParler; returns (pcm16_le_bytes, sample_rate)."""
    import torch

    model, tokenizer, desc_tokenizer = _get_parler()
    sample_rate = int(getattr(model.config.audio_encoder, "sampling_rate", 44100))
    description = _PARLER_VOICE.get(language, _PARLER_VOICE["en"])

    pcm_parts: list[bytes] = []
    for chunk in _split_chunks(text, _PARLER_CHUNK_CHARS):
        input_ids = tokenizer(chunk, return_tensors="pt").input_ids
        desc_ids = desc_tokenizer(description, return_tensors="pt").input_ids
        with torch.no_grad():
            try:
                generation = model.generate(
                    input_ids=input_ids,
                    prompt_input_ids=desc_ids,
                    do_sample=False,  # greedy: fastest deterministic decode
                    max_new_tokens=1200,
                )
            except TypeError:
                # Older parler-tts generate() signatures: no extra kwargs.
                generation = model.generate(
                    input_ids=input_ids,
                    prompt_input_ids=desc_ids,
                )
        pcm = (
            generation.audio.squeeze()
            .clamp(-1.0, 1.0)
            .mul(32767)
            .to(torch.int16)
            .numpy()
            .astype("<i2")
            .tobytes()
        )
        pcm_parts.append(pcm)
        pcm_parts.append(b"\x00\x00" * int(sample_rate * 0.15))  # 150ms pause

    if not pcm_parts:
        raise RuntimeError("IndicParler produced no audio")
    return b"".join(pcm_parts), sample_rate


# ── Engine 2: Meta MMS VITS (fallback) ─────────────────────────────────────

# Platform language -> MMS checkpoint (all ungated, HF cacheable).
_MMS_MODEL: dict[str, str] = {
    "en": "facebook/mms-tts-eng",
    "hi": "facebook/mms-tts-hin",
    "bn": "facebook/mms-tts-ben",
    "ta": "facebook/mms-tts-tam",
    "te": "facebook/mms-tts-tel",
    "ml": "facebook/mms-tts-mal",
}

_mms_lock = threading.Lock()
_mms_lang: str | None = None
_mms_pair: tuple | None = None  # (tokenizer, model) for _mms_lang — single slot


def _get_mms(language: str) -> tuple:
    """Return (tokenizer, model) for the language, swapping the single
    resident slot when the language changes. Thread-safe."""
    global _mms_lang, _mms_pair

    if _mms_lang == language and _mms_pair is not None:
        return _mms_pair
    with _mms_lock:
        if _mms_lang == language and _mms_pair is not None:
            return _mms_pair
        from transformers import AutoTokenizer, VitsModel

        name = _MMS_MODEL[language]
        tokenizer = AutoTokenizer.from_pretrained(name)
        model = VitsModel.from_pretrained(name)
        model.eval()
        _mms_pair = (tokenizer, model)
        _mms_lang = language
        logger.info("TTS: local MMS model %s resident (fallback)", name)
        return _mms_pair


def _synthesize_mms(text: str, language: str) -> tuple[bytes, int]:
    """Synthesize with the local MMS VITS model; returns (pcm16_le_bytes, rate)."""
    import torch

    tokenizer, model = _get_mms(language)
    sample_rate = int(getattr(model.config, "sampling_rate", 16000))

    pcm_parts: list[bytes] = []
    for chunk in _split_chunks(text, _MMS_CHUNK_CHARS):
        inputs = tokenizer(chunk, return_tensors="pt", truncation=True, max_length=_MMS_CHUNK_CHARS)
        with torch.no_grad():
            waveform = model(**inputs).waveform
        pcm = (
            waveform.squeeze()
            .clamp(-1.0, 1.0)
            .mul(32767)
            .to(torch.int16)
            .numpy()
            .astype("<i2")
            .tobytes()
        )
        pcm_parts.append(pcm)
        pcm_parts.append(b"\x00\x00" * int(sample_rate * 0.12))  # 120ms pause

    if not pcm_parts:
        raise RuntimeError("MMS TTS produced no audio")
    return b"".join(pcm_parts), sample_rate


# ── Shared plumbing ────────────────────────────────────────────────────────


def _split_chunks(text: str, max_chars: int) -> list[str]:
    """Sentence-split, then pack into <=max_chars pieces."""
    parts = re.split(r"(?<=[।.!?।\n])\s+", text.strip())
    parts = [p.strip() for p in parts if p.strip()]
    chunks: list[str] = []
    current = ""
    for part in parts:
        if current and len(current) + len(part) + 1 > max_chars:
            chunks.append(current)
            current = part
        else:
            current = f"{current} {part}".strip()
    if current:
        chunks.append(current)
    return chunks[:60]


def _to_wav(pcm: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


def prewarm() -> None:
    """Warm the instant-answer path at boot: the English MMS model (~150 MB,
    seconds). IndicParler deliberately does NOT prewarm — its first use
    downloads 3.75 GB and holds ~4 GB of RAM, which must happen on demand,
    never during boot warm-up. Optional: a failed load retries on first use."""
    from app.core import warmup

    def _load():
        try:
            _get_mms("en")
        except Exception:
            logger.exception("TTS prewarm failed (will retry on first use)")
            raise

    warmup.REGISTRY.track("tts", _load, required=False)


def synthesize_speech(text: str, language: str = "en") -> tuple[bytes, str]:
    """Convert text to speech and return (audio_bytes, media_type).

    Args:
        text: The text to speak (chatbot answer, notification, etc.).
        language: ISO-639-1 code ('en', 'hi', 'bn', 'te', 'ta', 'ml').

    Returns:
        (audio_bytes, media_type) — always 'audio/wav'.

    Engine chain (each falls to the next on ANY failure):
      parler -> mms   (IndicParler-TTS primary, local MMS VITS fallback)
    """
    if not text or not text.strip():
        raise RuntimeError("Empty text — nothing to speak.")

    language = (language or "en").split("-", 1)[0].lower()
    if language not in _PARLER_VOICE:
        raise RuntimeError(f"Local TTS has no voice for language={language!r}")
    text = text.strip()[:_MAX_TTS_CHARS]

    errors: list[str] = []
    for engine in ("parler", "mms"):
        try:
            if engine == "parler":
                pcm, rate = _synthesize_parler(text, language)
            else:
                if language not in _MMS_MODEL:
                    raise RuntimeError("no MMS voice for this language")
                pcm, rate = _synthesize_mms(text, language)
            return _to_wav(pcm, rate), "audio/wav"
        except Exception as exc:
            errors.append(f"{engine}: {type(exc).__name__}: {exc}")
            logger.warning(
                "TTS engine %s failed for language=%r (%s: %s); trying next",
                engine, language, type(exc).__name__, str(exc)[:200],
            )

    # Legacy phrase the Node proxy and verify.mjs rely on for the 503 path.
    raise RuntimeError(
        f"All TTS providers failed for language={language!r} ({'; '.join(errors)})"
    )
