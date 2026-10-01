"""Text-to-speech with cloud providers (Sarvam / Google Cloud).

Provider chain (each falls to the next on ANY failure):
  sarvam -> google

Selection is via TTS_PROVIDER in settings/.env:
  - "sarvam" (default): Sarvam Bulbul v3 neural voices — natural voices built
    for Indian languages, code-mixed text and number normalization. Free
    tier, ~1s server round trip.
  - "google": Google Cloud TTS v1 (GOOGLE_API_KEY, needs billing).

Local neural TTS (Coqui fairseq VITS, gTTS) was deliberately removed:
the cloud engines are faster (0.7-1.3s vs 2-6s local synthesis), sound far
more natural, and dropping the resident Coqui models frees ~700MB RAM for
the local Whisper STT model. Both providers chunk long text above their REST
caps and concatenate the PCM. Output is always WAV (PCM 16-bit mono 22050 Hz).
"""
from __future__ import annotations

import io
import logging
import re
import wave

from app.core.config import settings

logger = logging.getLogger("shramsetu.tts")

_MAX_TTS_CHARS = 5000


def _wav_pcm(wav_bytes: bytes) -> bytes:
    """Extract raw PCM frames from a WAV (walks RIFF chunks properly —
    robust to extra metadata)."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as w:
        return w.readframes(w.getnframes())


# Platform language -> cloud locale codes (Sarvam AND Google use these).
_CLOUD_LANG: dict[str, str] = {
    "en": "en-IN",
    "hi": "hi-IN",
    "bn": "bn-IN",
    "te": "te-IN",
    "ta": "ta-IN",
    "ml": "ml-IN",
}


def _split_sentences(text: str) -> list[str]:
    """Split into sentence-sized chunks — long single inputs degrade neural
    voices and hit REST request-size caps."""
    parts = re.split(r"(?<=[।.!?।\n])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()][:60]


def _synthesize_sarvam(text: str, language: str) -> bytes:
    """Sarvam Bulbul v3 — natural neural voices built for Indian languages
    (handles code-mixed text and number normalization natively). Free tier,
    ~1s server round trip. Returns WAV bytes; chunks text above the 2500
    char/request REST cap and concatenates the PCM."""
    import base64

    import requests

    if not settings.SARVAM_API_KEY:
        raise RuntimeError("TTS_PROVIDER=sarvam but SARVAM_API_KEY is not set")

    lang_code = _CLOUD_LANG.get(language)
    if lang_code is None:
        raise RuntimeError(f"Sarvam TTS has no voice for language={language!r}")

    # Split on sentence boundaries into <=2400-char chunks (REST cap 2500).
    chunks: list[str] = []
    current = ""
    for part in _split_sentences(text):
        if current and len(current) + len(part) + 1 > 2400:
            chunks.append(current)
            current = part
        else:
            current = f"{current} {part}".strip()
    if current:
        chunks.append(current)

    pcm_parts: list[bytes] = []
    for chunk in chunks:
        response = requests.post(
            "https://api.sarvam.ai/text-to-speech",
            headers={"api-subscription-key": settings.SARVAM_API_KEY},
            json={
                "text": chunk,
                "language_code": lang_code,
                "speaker": settings.SARVAM_TTS_SPEAKER,
                "model": settings.SARVAM_TTS_MODEL,
            },
            timeout=30,
        )
        response.raise_for_status()
        audios = response.json().get("audios") or []
        if not audios:
            raise RuntimeError("Sarvam TTS returned no audio")
        wav = base64.b64decode("".join(audios))
        pcm_parts.append(_wav_pcm(wav))
        pcm_parts.append(b"\x00\x00" * int(22050 * 0.18))  # 180ms inter-chunk gap

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(22050)
        w.writeframes(b"".join(pcm_parts))
    return buf.getvalue()


def _synthesize_google(text: str, language: str) -> bytes:
    """Google Cloud Text-to-Speech v1 (plain API key, no SDK). Needs billing
    enabled on the Google project; kept as the automatic fallback behind
    Sarvam."""
    import base64

    import requests

    if not settings.GOOGLE_API_KEY:
        raise RuntimeError("TTS fallback=google but GOOGLE_API_KEY is not set")

    lang_code = _CLOUD_LANG.get(language)
    if lang_code is None:
        raise RuntimeError(f"Google TTS has no configured locale for language={language!r}")

    response = requests.post(
        f"https://texttospeech.googleapis.com/v1/text:synthesize?key={settings.GOOGLE_API_KEY}",
        json={
            "input": {"text": text[:2500]},
            "voice": {"languageCode": lang_code},
            "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 22050},
        },
        timeout=30,
    )
    response.raise_for_status()
    audio_b64 = response.json().get("audioContent")
    if not audio_b64:
        raise RuntimeError("Google TTS returned no audio")
    return base64.b64decode(audio_b64)


def synthesize_speech(text: str, language: str = "en") -> tuple[bytes, str]:
    """Convert text to speech and return (audio_bytes, media_type).

    Args:
        text: The text to speak (chatbot answer, notification, etc.).
        language: ISO-639-1 code ('en', 'hi', 'bn', 'te', 'ta', 'ml').

    Returns:
        (audio_bytes, media_type) — always 'audio/wav'.

    Provider chain (each falls to the next on ANY failure):
      sarvam -> google      (Sarvam: natural Indian voices, free tier;
                             Google Cloud: needs billing)
    """
    if not text or not text.strip():
        raise RuntimeError("Empty text — nothing to speak.")

    language = (language or "en").split("-", 1)[0].lower()
    text = text.strip()[:_MAX_TTS_CHARS]

    chain: list[str] = {
        "sarvam": ["sarvam", "google"],
        "google": ["google", "sarvam"],
        # Unknown/legacy values (coqui/gtts were removed) -> default chain.
    }.get(settings.TTS_PROVIDER, ["sarvam", "google"])

    for provider in chain:
        try:
            if provider == "sarvam":
                return _synthesize_sarvam(text, language), "audio/wav"
            return _synthesize_google(text, language), "audio/wav"
        except Exception:
            logger.exception("TTS provider=%s failed for language=%r; trying next", provider, language)

    raise RuntimeError(f"All TTS providers failed for language={language!r}")
