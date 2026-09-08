from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import SessionDep, CurrentUser
from app.core.config import settings as app_settings
from app.repositories.user_repository import UserRepository
from app.schemas.auth import WorkerPublic

router = APIRouter(prefix="/settings", tags=["Settings"])


class LanguageUpdateRequest(BaseModel):
    language: str


@router.get("/languages")
def list_languages():
    return {"supported_languages": app_settings.SUPPORTED_LANGUAGES}


@router.put("/language", response_model=WorkerPublic)
def update_language(payload: LanguageUpdateRequest, session: SessionDep, current_user: CurrentUser):
    current_user.preferred_language = payload.language
    UserRepository(session).update(current_user)
    return WorkerPublic.model_validate(current_user)
