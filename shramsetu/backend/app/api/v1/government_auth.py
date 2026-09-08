"""
Government authentication endpoints — separate from worker auth.
Government officials login with employee_id + password.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr

from app.api.deps import CurrentGovernmentUser, SessionDep, SuperadminUser
from app.models.government import GovernmentUser
from app.schemas.government import (
    GovernmentLoginRequest,
    GovernmentRegisterRequest,
    GovernmentPublic,
)
from app.services.government_auth_service import GovernmentAuthService
from app.services.audit_service import log_audit

router = APIRouter(prefix="/auth/government", tags=["Government Auth"])


@router.post("/login")
def login_government(
    payload: GovernmentLoginRequest,
    session: SessionDep,
    request: Request,
):
    service = GovernmentAuthService(session)
    user = service.authenticate(payload.employee_id, payload.password)
    token = service.issue_token(user)

    # Audit log
    log_audit(
        session,
        actor_id=user.id,
        actor_role="government",
        actor_identifier=user.employee_id,
        action="login",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return {
        "access_token": token,
        "government": GovernmentPublic.from_model(user).model_dump(),
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_government(
    payload: GovernmentRegisterRequest,
    session: SessionDep,
    current_user: SuperadminUser,
):
    """Register a new government user (superadmin only)."""
    service = GovernmentAuthService(session)
    user = service.register(
        employee_id=payload.employee_id,
        full_name=payload.full_name,
        email=payload.email,
        mobile_number=payload.mobile_number,
        password=payload.password,
        department=payload.department or "general",
        designation=payload.designation,
        state=payload.state,
        district=payload.district,
        is_superadmin=payload.is_superadmin or False,
    )
    return GovernmentPublic.from_model(user).model_dump()


@router.get("/me", response_model=GovernmentPublic)
def get_me(current_user: CurrentGovernmentUser):
    return GovernmentPublic.from_model(current_user)
