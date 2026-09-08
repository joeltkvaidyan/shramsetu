"""
Speech-to-text via Groq's hosted Whisper endpoint.

This exists specifically to give the mobile app real voice input: reliable
on-device STT needs a native module that doesn't run inside Expo Go, but
Groq (already used for the chatbot's text generation) also hosts
Whisper-based transcription on the same free-tier API key — no separate
service or paid account needed. The mobile app records audio locally and
uploads it here; the browser-based web app instead uses the built-in Web
Speech API directly (see frontend/src/hooks/useVoice.ts), so this endpoint
is mobile's equivalent of that.
"""
from __future__ import annotations

import logging
import time as _time

from app.core.config import settings

logger = logging.getLogger("shramsetu.stt")

_groq_client = None

# Context prompts per language — Whisper uses these to improve accuracy
# for domain-specific vocabulary (e-Shram, PM Suraksha Bima, etc.)
_CONTEXT_PROMPTS: dict[str, str] = {
    "en": (
        "This is a question about Indian migrant worker welfare, "
        "government schemes like e-Shram, PM Suraksha Bima, ration card, "
        "minimum wages, ESIC, EPF, construction workers act."
    ),
    "hi": (
        "\u092f\u0939 \u092d\u093e\u0930\u0924 \u0915\u0947 "
        "\u092a\u094d\u0930\u0935\u093e\u0938\u0940 \u0936\u094d\u0930"
        "\u092e\u093f\u0915\u094b\u0902 \u0915\u0947 \u0932\u093f\u090f "
        "\u0938\u0930\u0915\u093e\u0930\u0940 \u092f\u094b\u091c\u0928"
        "\u093e\u0913\u0902 \u0915\u0947 \u092c\u093e\u0930\u0947 \u0938"
        "\u0947 \u092a\u0942\u091b\u093e \u0917\u092f\u093e \u0938\u0935"
        "\u093e\u0932 \u0939\u0948\u0964 \u0908-\u0936\u094d\u0930\u092e, "
        "\u092a\u0940\u090f\u092e \u0938\u0941\u0930\u0915\u094d\u0937"
        "\u093e \u092c\u0940\u092e\u093e, \u0930\u093e\u0936\u0928 "
        "\u0915\u093e\u0930\u094d\u0921, \u0928\u094d\u092f\u0942\u0928"
        "\u0924\u092e \u092e\u091c\u0926\u0942\u0930\u0940\u0964"
    ),
    "bn": (
        "\u098f\u099f\u09bf \u09ad\u09be\u09b0\u09a4\u09be\u09b0 "
        "\u09aa\u09cd\u09b0\u09ac\u09be\u09b8\u09c0 \u09b6\u09cd\u09b0"
        "\u09ae\u09bf\u0995\u09a6\u09c7\u09b0 \u0995\u09b2\u09cd\u09af"
        "\u09be\u09a3 \u09b8\u09ae\u09cd\u09aa\u09b0\u09cd\u0995\u09bf"
        "\u09a4 \u09b8\u09b0\u0995\u09be\u09b0\u09c0 \u09af\u09cb\u099c"
        "\u09a8\u09be\u09b0 \u09ac\u09bf\u09b7\u09af\u09bc\u09cb\u09a6"
        "\u09cd\u09b9 \u0987-\u09b6\u09cd\u09b0\u09ae, \u09aa\u09bf"
        "\u098f\u09ae \u09b8\u09c1\u09b0\u0995\u09cd\u09b7\u09be "
        "\u09ac\u09bf\u09ae\u09be, \u09b0\u09c7\u09b6\u09a8 \u0995"
        "\u09be\u09b0\u09cd\u09a1\u0964"
    ),
    "te": (
        "\u0c08\u0c21\u0c3f \u0c2d\u0c3e\u0c30\u0c24 \u0c35\u0c32"
        "\u0c38 \u0c15\u0c3e\u0c30\u0c4d\u0c2e\u0c3f\u0c15\u0c41\u0c32"
        " \u0c15\u0c4d\u0c37\u0c47\u0c2e \u0c17\u0c41\u0c30\u0c3f\u0c38"
        "\u0c4d\u0c25\u0c3e \u0c2a\u0c46\u0c02\u0c1f\u0c3e \u0c2a\u0c4d"
        "\u0c30\u0c36\u0c4d\u0c23\u0c3f\u0c38\u0c4d\u0c24\u0c3e\u0c35"
        "\u0c3e\u0c02 \u0c15\u0c4b\u0c38\u0c02 \u0c08-\u0c36\u0c4d\u0c30"
        "\u0c2e\u0c4d, \u0c2a\u0c40\u0c0f\u0c2e \u0c38\u0c41\u0c30\u0c15"
        "\u0c4d\u0c37\u0c3e \u0c2c\u0c40\u0c2e\u0c3e, \u0c30\u0c47\u0c37"
        "\u0c28 \u0c15\u0c3e\u0c30\u0c4d\u0c21\u0964"
    ),
    "ta": (
        "\u0b87\u0ba4\u0bc1 \u0b87\u0ba8\u0bcd\u0ba4\u0bbf\u0af2"
        " \u0baa\u0bc1\u0bb2\u0bae\u0bcd\u0baa\u0bc6\u0baf\u0bb0\u0bcd"
        " \u0ba4\u0bca\u0b9a\u0bbf\u0bb2\u0bbe\u0bb3\u0bb0\u0bcd"
        " \u0ba8\u0bb2 \u0b85\u0bb0\u0b9a\u0bc1 \u0b9a\u0bca\u0b95"
        " \u0b9a\u0bca\u0b95\u0bb2\u0bc8 \u0b9a\u0bc7\u0bb0\u0bcd\u0b95"
        " \u0b85\u0bc6\u0bb3\u0bc1\u0b95\u0bbf\u0baf \u0b87-\u0b9a\u0bcd"
        "\u0bb0\u0bae\u0bcd, \u0baa\u0bc0\u0b90\u0eba\u0bae\u0bcd "
        "\u0b9a\u0bc1\u0bb0\u0b95\u0bcd\u0b97\u0bb8\u0bcd\u0b9a\u0bbe, "
        "\u0bb0\u0bc7\u0b9a\u0ba9\u0bcd \u0b95\u0bbe\u0bb0\u0bcd\u0b9f\u0bc1\u0964"
    ),
    "ml": (
        "\u0d07\u0d24\u0d41 \u0d07\u0d23\u0d4d\u0d24\u0d4d\u0d2f"
        " \u0d15\u0d41\u0d1f\u0d3f\u0d2f\u0d4b\u0d02\u0d1e\u0d4d "
        "\u0d24\u0d4a\u0d1e\u0d3f\u0d32\u0d3e\u0d33\u0d3f\u0d15\u0d3e"
        "\u0d33\u0d3d \u0d28\u0d32 \u0d05\u0d30\u0d38\u0d4d\u0d2f"
        "\u0d38\u0d4d\u0d25 \u0d1a\u0d4b\u0d32\u0d4d\u0d38\u0d4d\u0d36"
        "\u0d3e\u0d2a\u0d28\u0d02 \u0d06\u0d39\u0d4d\u0d38\u0d4d\u0d31"
        "\u0d02, \u0d2a\u0d3f\u0d0f\u0d2e\u0d4d \u0d38\u0d41\u0d30"
        "\u0d15\u0d4d\u0d37\u0d3e \u0d2a\u0d40\u0d33\u0d3f\u0d2e, "
        "\u0d31\u0d47\u0d37\u0d28\u0d4d \u0d15\u0d3e\u0d30\u0d4d\u0d21\u0964"
    ),
}


def _get_client():
    global _groq_client
    if _groq_client is None:
        from groq import Groq

        if not settings.GROQ_API_KEY:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Add it to backend/.env to enable voice input."
            )
        _groq_client = Groq(api_key=settings.GROQ_API_KEY)
    return _groq_client


def transcribe_audio(
    file_bytes: bytes, filename: str, language: str | None = None
) -> str:
    """Returns the transcribed text.

    ``language`` is an ISO-639-1 code (e.g. ``hi``, ``ta``).  A correct hint
    measurably improves accuracy for Indian languages.  A domain-specific
    prompt is also sent so Whisper recognises migrant-worker terminology even
    with background noise or unclear pronunciation.
    """
    client = _get_client()
    prompt = _CONTEXT_PROMPTS.get(language or "", _CONTEXT_PROMPTS["en"])

    # Retry up to 3 times for transient errors (rate limits, empty results)
    for attempt in range(3):
        try:
            result = client.audio.transcriptions.create(
                file=(filename, file_bytes),
                model=settings.GROQ_STT_MODEL,
                language=language or None,
                prompt=prompt,
                response_format="text",
            )
            text = (
                result
                if isinstance(result, str)
                else getattr(result, "text", str(result))
            )
            cleaned = text.strip().strip(".,!? ")
            if cleaned:
                return text.strip()
            # Empty result — retry
            if attempt < 2:
                logger.warning(
                    "Empty transcription on attempt %d, retrying...", attempt + 1
                )
                _time.sleep(0.5)
                continue
            return text.strip()
        except Exception as e:
            err_str = str(e).lower()
            if ("rate" in err_str or "429" in err_str or "too many" in err_str) and attempt < 2:
                wait = 2 * (attempt + 1)
                logger.warning(
                    "Rate limited on attempt %d, retrying in %ds...",
                    attempt + 1,
                    wait,
                )
                _time.sleep(wait)
                continue
            logger.exception("Transcription failed")
            raise

    return ""
