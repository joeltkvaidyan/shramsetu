"""WebSocket-based live transcription endpoint.

Streams audio chunks from the browser to Groq Whisper and returns
transcribed text in real-time. Works on ALL phones regardless of
HTTP/HTTPS.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings

logger = logging.getLogger("shramsetu.live_stt")

router = APIRouter(tags=["Live Transcription"])

# Context prompts per language for better Whisper accuracy
_CONTEXT_PROMPTS: dict[str, str] = {
    "en": (
        "This is a question about Indian migrant worker welfare, "
        "government schemes like e-Shram, PM Suraksha Bima, ration card, "
        "minimum wages, ESIC, EPF, construction workers act."
    ),
    "hi": "यह भारत के प्रवासी श्रमिक कल्याण, ई-श्रम, पीएम सुरक्षा बीमा, राशन कार्ड, न्यूनतम मजदूरी के बारे में प्रश्न है।",
    "bn": "এটি ভারতের প্রবাসী শ্রমিক কল্যাণ, ঈ-শ্রম, পিএম সুরক্ষা বিমা, রেশন কার্ড সম্পর্কে প্রশ্ন।",
    "te": "ఇది భారతదేశ వలస కార్మికుల సంక్షేమం, ఈ-శ్రమ, పీఎం సురక్షా బీమా గురించి ప్రశ్న.",
    "ta": "இது இந்திய புலம்பெயர் தொழிலாளர் நலன், ஈ-ஷ்ரம், பிஎம் சுரக்ஷா பீமா பற்றிய கேள்வி.",
    "ml": "ഇത് ഇന്ത്യയുടെ കുടിയേറ്റ തൊഴിലാളി ക്ഷേമം, ഈ-ശ്രം, പിഎം സുരക്ഷാ ബീമ എന്നിവയെക്കുറിച്ചുള്ള ചോദ്യമാണ്.",
}


def _transcribe_sync(audio_bytes: bytes, language: str, filename: str = "chunk.webm") -> str:
    """Synchronous Groq Whisper transcription."""
    from groq import Groq

    if not settings.GROQ_API_KEY:
        return ""

    client = Groq(api_key=settings.GROQ_API_KEY)
    prompt = _CONTEXT_PROMPTS.get(language or "", _CONTEXT_PROMPTS["en"])

    result = client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model=settings.GROQ_STT_MODEL,
        language=language or None,
        prompt=prompt,
        response_format="text",
    )
    text = result if isinstance(result, str) else getattr(result, "text", str(result))
    return text.strip()


async def _transcribe_chunk(audio_bytes: bytes, language: str, filename: str = "chunk.webm") -> str:
    """Async wrapper — runs Groq Whisper in thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: _transcribe_sync(audio_bytes, language, filename))


@router.websocket("/ws/transcribe")
async def live_transcribe_ws(websocket: WebSocket):
    """WebSocket endpoint for live audio transcription.

    Protocol:
      1. Client connects
      2. Client sends JSON: {"language": "ml", "action": "start"}
      3. Client sends binary audio chunks (WebM/Opus from MediaRecorder, 1s each)
      4. Client sends JSON: {"action": "stop"} when done
      5. Server sends: {"type": "started", "language": "ml"}
      6. Server sends: {"type": "partial", "text": "..."} as chunks arrive
      7. Server sends: {"type": "final", "text": "..."} with combined transcription
    """
    await websocket.accept()
    logger.info("[ws] Client connected")

    language = "en"
    all_chunks: list[bytes] = []
    chunk_count = 0
    partial_texts: list[str] = []

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.receive":
                # --- JSON control message ---
                if "text" in message and message["text"]:
                    try:
                        data = json.loads(message["text"])
                        action = data.get("action", "")

                        if action == "start":
                            language = data.get("language", "en")
                            all_chunks = []
                            partial_texts = []
                            chunk_count = 0
                            logger.info("[ws] Start, lang=%s", language)
                            await websocket.send_json({"type": "started", "language": language})

                        elif action == "stop":
                            logger.info("[ws] Stop, %d chunks, %d partials", len(all_chunks), len(partial_texts))
                            # Combine all chunks for final transcription
                            if all_chunks:
                                combined = b"".join(all_chunks)
                                if len(combined) > 500:
                                    text = await _transcribe_chunk(combined, language, "live_final.webm")
                                    await websocket.send_json({"type": "final", "text": text})
                                else:
                                    await websocket.send_json({"type": "final", "text": ""})
                            else:
                                await websocket.send_json({"type": "final", "text": ""})
                            break

                    except json.JSONDecodeError:
                        pass

                # --- Binary audio chunk ---
                elif "bytes" in message and message["bytes"]:
                    chunk = message["bytes"]
                    all_chunks.append(chunk)
                    chunk_count += 1

                    # Transcribe every 3rd chunk (~3 seconds of audio) for partial feedback
                    if chunk_count % 3 == 0 and len(chunk) > 500:
                        recent = b"".join(all_chunks[-3:])
                        try:
                            text = await _transcribe_chunk(recent, language, f"partial_{chunk_count}.webm")
                            if text:
                                partial_texts.append(text)
                                await websocket.send_json({"type": "partial", "text": " ".join(partial_texts)})
                        except Exception as e:
                            logger.warning("[ws] Partial transcription failed: %s", e)

            elif message["type"] == "websocket.disconnect":
                break

    except WebSocketDisconnect:
        logger.info("[ws] Client disconnected")
    except Exception as e:
        logger.error("[ws] Error: %s", e)
        try:
            await websocket.send_json({"type": "error", "text": str(e)})
        except Exception:
            pass
