"""Text-to-speech — Meta MMS VITS (primary), AI4Bharat IndicParler-TTS (fallback).

Primary engine: `facebook/mms-tts-*` (VITS) — a ~150 MB local model per
language, no extra system deps. Measured on this box (bench 2): 0.8-1.7s
model load and 1.4-2.7s synthesis per sentence across all six languages,
i.e. faster than realtime. All six voices are prewarmed at boot.

Fallback engine: `ai4bharat/indic-parler-tts` — the Indic extension of
Parler-TTS Mini (gated on Hugging Face, ~3.75 GB, needs espeak-ng). It is
autoregressive and decodes at ~0.2s/token on this 4-thread CPU — roughly
24s of compute per second of audio (bench 1) — so it can never be the
fast path on this hardware. It loads LAZILY and runs only when MMS fails,
keeping /speak answering instead of dying (bench 2 also found greedy
Parler output degenerates to partial speech; see _synthesize_parler).

Everything runs on this box: no API keys, no network calls at synthesis
time. Finished utterances are LRU-cached by (language, text), so a repeat
request is instant.

Output contract is unchanged: WAV bytes, PCM 16-bit mono, media type
audio/wav (one sample rate per response — MMS 16 kHz, Parler ~44.1 kHz).
"""
from __future__ import annotations

import collections
import io
import logging
import os
import re
import threading
import wave

from app.core.config import settings

logger = logging.getLogger("shramsetu.tts")

# espeak-ng for Parler phonemization. The venv bundles espeak-ng via
# `espeakng-loader`, but phonemizer only looks for a SYSTEM espeak
# (PHONEMIZER_ESPEAK_LIBRARY or ctypes find_library) — on Windows that
# means "espeak not installed on your system" at first use. Point it at
# the bundled DLL/data instead: no host install, no admin rights. The MMS
# fallback needs neither, so a failure here must not break the module.
try:
    import espeakng_loader as _espeak_loader

    os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", str(_espeak_loader.get_library_path()))
    os.environ.setdefault("PHONEMIZER_ESPEAK_DATA_PATH", str(_espeak_loader.get_data_path()))
except Exception:  # pragma: no cover — Parler degrades, MMS still speaks
    logger.warning("espeakng-loader unavailable — Parler phonemization will fail; MMS fallback unaffected")

_MAX_TTS_CHARS = 5000
# Parler is autoregressive: long single inputs degrade prosody and grow
# latency super-linearly. Sentence-pack at this size (Parler), larger for MMS.
_PARLER_CHUNK_CHARS = 200
_MMS_CHUNK_CHARS = 300

# Parler never emits EOS before max_new_tokens on this box (benches 1/2), so
# the cap IS the audio-length dial: ~86.13 audio tokens per second of speech
# at ~0.2s/token on 4 threads. The old flat 1200 (~14s of audio, 2-4 min of
# compute) was wasted on one-line greetings. Scale from text length using the
# worst measured token density (~13 tokens/char for Indic text, bench 2) with
# a ~1s floor; only the Parler fallback path uses this.
_PARLER_TOKENS_PER_CHAR = 13
_PARLER_MIN_TOKENS = 86
_PARLER_MAX_TOKENS = 1200


def _parler_token_cap(text: str) -> int:
    """max_new_tokens sized to what `text` can actually need to speak."""
    return max(_PARLER_MIN_TOKENS, min(_PARLER_MAX_TOKENS, len(text) * _PARLER_TOKENS_PER_CHAR))

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
        from transformers import AutoTokenizer
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
        # Official IndicParler mapping (model card):
        #   description  -> input_ids        (flan-t5 text encoder, vocab 32128)
        #   transcript   -> prompt_input_ids (decoder prompt, repo tokenizer)
        # The reverse mapping feeds Llama ids (vocab 90714) into the flan-t5
        # embedding, and any id >= 32128 (typical for Indic scripts) raises
        # IndexError: index out of range in self.
        desc_batch = desc_tokenizer(description, return_tensors="pt")
        prompt_batch = tokenizer(chunk, return_tensors="pt")
        with torch.no_grad():
            try:
                generation = model.generate(
                    input_ids=desc_batch.input_ids,
                    attention_mask=desc_batch.attention_mask,
                    prompt_input_ids=prompt_batch.input_ids,
                    prompt_attention_mask=prompt_batch.attention_mask,
                    # Benches 2/3: greedy (do_sample=False) degenerates — it
                    # stops speaking mid-sentence, then pads to the cap in
                    # silence and never emits EOS (transcribed as just
                    # 'Namaste.' for a whole greeting). Sampling emits EOS at
                    # the natural sentence end with complete speech.
                    do_sample=True,
                    temperature=0.7,
                    top_p=0.9,
                    max_new_tokens=_parler_token_cap(chunk),
                )
            except TypeError:
                # Older parler-tts generate() signatures: no extra kwargs.
                generation = model.generate(
                    input_ids=desc_batch.input_ids,
                    prompt_input_ids=prompt_batch.input_ids,
                    do_sample=True,
                    max_new_tokens=_parler_token_cap(chunk),
                )

        # generate() returns a plain waveform tensor when
        # return_dict_in_generate is off (this repo's default), and an
        # object with .audio when on — accept both.
        audio = generation.audio if hasattr(generation, "audio") else generation
        pcm = (
            audio.squeeze()
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
    resident slot when the language changes. Thread-safe: BOTH the state
    check and the swap run under the lock. The old fast path read _mms_lang
    and _mms_pair without it, so a /speak racing a concurrent swap (e.g.
    during the boot prewarm cycle) could receive another language's pair —
    its tokenizer then drops every out-of-vocab char, yielding an empty
    input and 'MMS TTS produced no audio'. Blocking on the lock also makes
    a concurrent request wait for an in-flight load instead of racing it."""
    global _mms_lang, _mms_pair

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
    chunks = _split_chunks(text, _MMS_CHUNK_CHARS)
    if not chunks:
        logger.warning("MMS %s: _split_chunks produced no chunks (text len=%d)",
                       language, len(text))
    for chunk in chunks:
        inputs = tokenizer(chunk, return_tensors="pt", truncation=True, max_length=_MMS_CHUNK_CHARS)
        if inputs.input_ids.numel() == 0:
            # VitsTokenizer drops every out-of-vocab char (e.g. a run of
            # '?') and returns an EMPTY sequence, which torch converts to
            # a float32 tensor — nn.embedding then raises "indices must be
            # Long/Int". Skip the chunk; if EVERY chunk skips, the
            # diagnostic raise below fires — that detail caught real
            # client-side mojibake in the field (text arriving as '?????'
            # tokenizes empty for every Indic language).
            logger.warning("MMS %s: chunk tokenized to EMPTY (chunk len=%d, vocab=%s)",
                           language, len(chunk), len(tokenizer))
            continue
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
        raise RuntimeError(
            f"MMS TTS produced no audio (chunks={len(chunks)}, "
            f"text_len={len(text)}, vocab={len(tokenizer)})"
        )
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


# LRU cache of finished utterances: (language, text) -> WAV bytes. Chat
# answers get re-spoken (retries, page revisits, the same notification read
# twice) and a hit is ~0ms versus seconds of synthesis. Bounded by count AND
# bytes: MMS WAV is ~32 KB per second of audio, so 64 MB is ~34 minutes.
_CACHE_MAX_ENTRIES = 64
_CACHE_MAX_BYTES = 64 * 1024 * 1024
_cache: "collections.OrderedDict[tuple[str, str], bytes]" = collections.OrderedDict()
_cache_bytes = 0
_cache_lock = threading.Lock()


def _cache_get(key: tuple[str, str]) -> bytes | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit is not None:
            _cache.move_to_end(key)
        return hit


def _cache_put(key: tuple[str, str], wav: bytes) -> None:
    global _cache_bytes
    with _cache_lock:
        if key in _cache:
            _cache_bytes -= len(_cache.pop(key))
        _cache[key] = wav
        _cache_bytes += len(wav)
        while _cache and (len(_cache) > _CACHE_MAX_ENTRIES or _cache_bytes > _CACHE_MAX_BYTES):
            _, evicted = _cache.popitem(last=False)
            _cache_bytes -= len(evicted)


def prewarm() -> None:
    """Warm all six MMS voices at boot — this is the primary /speak path now
    (0.8-1.7s loads; measured in bench 2). Models swap through a single
    resident slot, so the cycle leaves English resident (the most likely
    first request) while the OS page cache keeps the other five warm, making
    a later language swap ~1s instead of a cold load. IndicParler deliberately
    does NOT prewarm: it is the fallback, and its ~3.3 GB RSS / 30s load must
    stay on-demand. A failed load retries on first use."""
    from app.core import warmup

    def _load():
        errors: list[str] = []
        for lang in (*_MMS_MODEL, "en"):  # re-load en so it is the resident slot
            try:
                _get_mms(lang)
            except Exception as exc:
                errors.append(f"{lang}: {type(exc).__name__}: {exc}")
                logger.exception("TTS prewarm failed for %s (will retry on first use)", lang)
        if errors:
            raise RuntimeError("; ".join(errors))

    warmup.REGISTRY.track("tts", _load, required=False)


def synthesize_speech(text: str, language: str = "en") -> tuple[bytes, str]:
    """Convert text to speech and return (audio_bytes, media_type).

    Args:
        text: The text to speak (chatbot answer, notification, etc.).
        language: ISO-639-1 code ('en', 'hi', 'bn', 'te', 'ta', 'ml').

    Returns:
        (audio_bytes, media_type) — always 'audio/wav'.

    Engine chain (each falls to the next on ANY failure):
      mms -> parler   (local MMS VITS primary — fast; IndicParler fallback)
    Repeated (language, text) pairs are served from a small LRU cache.
    """
    if not text or not text.strip():
        raise RuntimeError("Empty text — nothing to speak.")

    language = (language or "en").split("-", 1)[0].lower()
    if language not in _PARLER_VOICE:
        raise RuntimeError(f"Local TTS has no voice for language={language!r}")
    text = text.strip()[:_MAX_TTS_CHARS]

    key = (language, text)
    cached = _cache_get(key)
    if cached is not None:
        return cached, "audio/wav"

    errors: list[str] = []
    for engine in ("mms", "parler"):
        try:
            if engine == "mms":
                if language not in _MMS_MODEL:
                    raise RuntimeError("no MMS voice for this language")
                pcm, rate = _synthesize_mms(text, language)
            else:
                pcm, rate = _synthesize_parler(text, language)
            wav = _to_wav(pcm, rate)
            _cache_put(key, wav)
            return wav, "audio/wav"
        except Exception as exc:
            errors.append(f"{engine}: {type(exc).__name__}: {exc}")
            # exception (not warning): the traceback is the only way to see
            # WHERE inside generation it failed — str() alone hid an
            # IndexError('index out of range in self') for weeks.
            logger.exception(
                "TTS engine %s failed for language=%r; trying next",
                engine, language,
            )

    # Legacy phrase the Node proxy and verify.mjs rely on for the 503 path.
    raise RuntimeError(
        f"All TTS providers failed for language={language!r} ({'; '.join(errors)})"
    )
