"""
Server-side text-to-speech using Google's gTTS (free, supports 6+ Indian languages).

When the browser's built-in speechSynthesis doesn't have a voice for the
selected language (very common for Hindi, Bengali, Telugu, Tamil, Malayalam
on Windows), the frontend falls back to this endpoint which returns an MP3
audio blob that the browser can play via a simple <audio> element.
"""
from __future__ import annotations

import io
import logging

from gtts import gTTS

logger = logging.getLogger("shramsetu.tts")

# gTTS uses ISO-639-1 language codes mapped to Google Translate's TTS engine.
# Our app's language codes already match ISO-639-1, so no mapping is needed.


def synthesize_speech(text: str, language: str = "en") -> bytes:
    """Convert text to speech and return MP3 audio bytes.

    Args:
        text: The text to speak (answer from the chatbot).
        language: ISO-639-1 code (e.g. 'en', 'hi', 'bn', 'te', 'ta', 'ml').

    Returns:
        MP3 audio bytes.

    Raises:
        RuntimeError: If TTS synthesis fails.
    """
    if not text or not text.strip():
        raise RuntimeError("Empty text — nothing to speak.")

    # Truncate very long text to avoid TTS timeout (gTTS has a ~100 char sweet spot
    # but handles longer text; we cap at 5000 chars for safety)
    text = text.strip()[:5000]

    try:
        tts = gTTS(text=text, lang=language, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return buf.read()
    except Exception as exc:
        logger.exception("gTTS synthesis failed for language=%r", language)
        raise RuntimeError(f"TTS synthesis failed: {exc}") from exc
