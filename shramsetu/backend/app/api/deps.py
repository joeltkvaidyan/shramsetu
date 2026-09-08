from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.user import User
from app.models.government import GovernmentUser
from app.repositories.user_repository import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/worker/login", auto_error=False)
gov_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/government/login", auto_error=False)

SessionDep = Annotated[Session, Depends(get_session)]


# ── Worker auth ──────────────────────────────────────────────────────

def get_current_user(
    session: SessionDep,
    token: Annotated[str | None, Depends(oauth2_scheme)] = None,
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise credentials_error

    # Ensure this is a worker token
    if payload.get("role") not in ("worker", None):
        raise credentials_error

    user = UserRepository(session).get_by_id(int(payload["sub"]))
    if not user or not user.is_active:
        raise credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# ── Government auth ──────────────────────────────────────────────────

def get_current_government_user(
    session: SessionDep,
    token: Annotated[str | None, Depends(gov_oauth2_scheme)] = None,
) -> GovernmentUser:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Government authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise credentials_error

    # Ensure this is a government token
    if payload.get("role") != "government":
        raise credentials_error

    user = session.get(GovernmentUser, int(payload["sub"]))
    if not user or not user.is_active:
        raise credentials_error
    return user


CurrentGovernmentUser = Annotated[GovernmentUser, Depends(get_current_government_user)]


# ── Superadmin check ────────────────────────────────────────────────

def require_superadmin(user: CurrentGovernmentUser) -> GovernmentUser:
    if not user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required",
        )
    return user


SuperadminUser = Annotated[GovernmentUser, Depends(require_superadmin)]
