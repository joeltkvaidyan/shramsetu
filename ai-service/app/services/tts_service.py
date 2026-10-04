"""Text-to-speech — fully LOCAL neural TTS (Meta MMS VITS via transformers).

No cloud providers, no API keys, no network round trips: Sarvam and Google
TTS were removed. Synthesis runs in-process on CPU.

Engine: facebook/mms-tts-* (VITS, ~60-150 MB per language). This is the
fairseq-VITS family the service used before moving to the cloud, and unlike
Coqui's model zoo it covers ALL six platform languages (en, hi, bn, ta, te,
ml). A sentence synthesizes in roughly 0.3-0.8s on CPU once the model is
loaded.

RAM policy: a single-slot cache keeps only the ACTIVE language resident
(~150 MB) so whisper and IndicTrans2 keep the rest of the box. The first
request in a different language pays a one-time load from the HF disk cache
(~1-2s); prewarm() loads English at boot so the common case is instant.

Output contract is unchanged: WAV bytes (PCM 16-bit mono), media type
audio/wav — MMS models emit 16 kHz.
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
# Long single inputs degrade VITS prosody and grow latency super-linearly;
# pack sentences into chunks at most this many characters.
_MAX_CHUNK_CHARS = 300

# Platform language -> Meta MMS VITS checkpoint (all ungated, HF cacheable).
_MMS_MODEL: dict[str, str] = {
    "en": "facebook/mms-tts-eng",
    "hi": "facebook/mms-tts-hin",
    "bn": "facebook/mms-tts-ben",
    "ta": "facebook/mms-tts-tam",
    "te": "facebook/mms-tts-tel",
    "ml": "facebook/mms-tts-mal",
}

_cache_lock = threading.Lock()
_loaded_lang: str | None = None
_loaded_pair: tuple | None = None  # (tokenizer, model) for _loaded_lang


def _get_model(language: str) -> tuple:
    """Return (tokenizer, model) for the language, swapping the single
    resident slot when the language changes. Thread-safe."""
    global _loaded_lang, _loaded_pair

    if _loaded_lang == language and _loaded_pair is not None:
        return _loaded_pair
    with _cache_lock:
        if _loaded_lang == language and _loaded_pair is not None:
            return _loaded_pair
        from transformers import AutoTokenizer, VitsModel

        name = _MMS_MODEL[language]
        tokenizer = AutoTokenizer.from_pretrained(name)
        model = VitsModel.from_pretrained(name)
        model.eval()
        _loaded_pair = (tokenizer, model)
        _loaded_lang = language
        logger.info("TTS: local model %s resident", name)
        return _loaded_pair


def _split_chunks(text: str) -> list[str]:
    """Sentence-split, then pack into <=_MAX_CHUNK_CHARS pieces."""
    parts = re.split(r"(?<=[।.!?।\n])\s+", text.strip())
    parts = [p.strip() for p in parts if p.strip()]
    chunks: list[str] = []
    current = ""
    for part in parts:
        if current and len(current) + len(part) + 1 > _MAX_CHUNK_CHARS:
            chunks.append(current)
            current = part
        else:
            current = f"{current} {part}".strip()
    if current:
        chunks.append(current)
    return chunks[:60]


def _synthesize_local(text: str, language: str) -> bytes:
    """Synthesize with the local MMS VITS model. Returns WAV bytes
    (PCM 16-bit mono, the model's native 16 kHz)."""
    import torch

    tokenizer, model = _get_model(language)
    sample_rate = int(getattr(model.config, "sampling_rate", 16000))

    pcm_parts: list[bytes] = []
    for chunk in _split_chunks(text):
        inputs = tokenizer(
            chunk,
            return_tensors="pt",
            truncation=True,
            max_length=_MAX_CHUNK_CHARS,
        )
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
        raise RuntimeError("local TTS produced no audio")

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(b"".join(pcm_parts))
    return buf.getvalue()


def prewarm() -> None:
    """Load the English voice at boot in a warm-up thread so the first
    /speak answers without a model load. Optional: a failed load must not
    hold /health/ready at 503 (it retries on first use)."""
    from app.core import warmup

    def _load():
        try:
            _get_model("en")
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

    Fully local: one in-process MMS VITS model, no provider chain.
    """
    if not text or not text.strip():
        raise RuntimeError("Empty text — nothing to speak.")

    language = (language or "en").split("-", 1)[0].lower()
    if language not in _MMS_MODEL:
        raise RuntimeError(f"Local TTS has no voice for language={language!r}")
    text = text.strip()[:_MAX_TTS_CHARS]

    try:
        return _synthesize_local(text, language), "audio/wav"
    except RuntimeError:
        raise
    except Exception as exc:
        # Keep the legacy 503 phrase the Node proxy and verify.mjs rely on:
        # the local engine failing is wire-compatible with the old cloud
        # provider chain failing (model download blocked, disk full, ...).
        raise RuntimeError(
            f"All TTS providers failed for language={language!r} "
            f"(local engine: {type(exc).__name__}: {exc})"
        ) from exc
