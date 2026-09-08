from __future__ import annotations

import json
from typing import List, Optional

import logging
from fastapi import APIRouter, File, HTTPException, UploadFile, status

logger = logging.getLogger("shramsetu.chat")

from app.api.deps import CurrentUser, SessionDep
from app.models.chat import ChatMessage
from app.repositories.chat_repository import ChatRepository
from app.schemas.chat import ChatAnswerResponse, ChatHistoryItem, ChatQueryRequest
from app.services import rag_service, stt_service, tts_service

router = APIRouter(prefix="/chat", tags=["AI Welfare Assistant"])


@router.get("/speak")
async def speak_text(
    text: str = "",
    language: str = "en",
):
    """Server-side text-to-speech. Returns MP3 audio bytes.
    Used as a fallback when the browser's built-in speechSynthesis
    doesn't have a voice for the selected language."""
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No text provided")
    try:
        audio = tts_service.synthesize_speech(text, language)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    from fastapi.responses import Response
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = None,
):
    """Speech-to-text for voice input (used by the mobile app — see
    stt_service.py for why this is server-side rather than on-device)."""
    content = await file.read()
    filename = file.filename or "audio.webm"
    logger.info("[transcribe] file=%s size=%d lang=%s", filename, len(content), language)

    if not content or len(content) < 500:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Audio file is too short or empty. Please record for at least 1 second.")

    try:
        text = stt_service.transcribe_audio(content, filename, language)
        logger.info("[transcribe] result=%r", text[:100] if text else "(empty)")
    except RuntimeError as exc:
        logger.error("[transcribe] error=%s", exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    return {"text": text.strip()}


@router.post("/ask", response_model=ChatAnswerResponse)
def ask_chatbot(payload: ChatQueryRequest, session: SessionDep, current_user: CurrentUser):
    result = rag_service.answer_question(payload.question, payload.language)

    repo = ChatRepository(session)
    repo.add(
        ChatMessage(
            owner_id=current_user.id,
            role="user",
            language=payload.language,
            content=payload.question,
        )
    )
    repo.add(
        ChatMessage(
            owner_id=current_user.id,
            role="assistant",
            language=payload.language,
            content=result["answer"],
            meta_json=json.dumps(result),
        )
    )
    return result


@router.get("/history", response_model=List[ChatHistoryItem])
def get_history(session: SessionDep, current_user: CurrentUser, limit: int = 50):
    from app.core.config import settings

    limit = max(1, min(limit, settings.MAX_PAGE_SIZE))
    items = ChatRepository(session).history_for_owner(current_user.id, limit=limit)
    out = []
    for item in items:
        meta = json.loads(item.meta_json) if item.meta_json else None
        out.append(
            ChatHistoryItem(
                role=item.role,
                content=item.content,
                language=item.language,
                created_at=item.created_at,
                meta=meta,
            )
        )
    return out


@router.delete("/history")
def clear_history(session: SessionDep, current_user: CurrentUser):
    """Clear all chat history for the current user."""
    repo = ChatRepository(session)
    deleted = repo.clear_for_owner(current_user.id)
    return {"detail": "Chat history cleared", "deleted_count": deleted}
