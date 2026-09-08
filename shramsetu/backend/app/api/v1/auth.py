from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Form, HTTPException, UploadFile, File, status
from pydantic import ValidationError

from app.api.deps import SessionDep, CurrentUser
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    OTPRequest,
    OTPVerifyRequest,
    RegisterResponse,
    TokenResponse,
    DevOTPLoginRequest,
    WorkerLoginRequest,
    WorkerPublic,
    WorkerRegisterRequest,
)
from app.core.security import hash_password
from app.services.auth_service import AuthService
from app.services.otp_service import OTPService
from app.services.storage_service import get_storage_service

router = APIRouter(prefix="/auth/worker", tags=["Worker Auth"])


def _to_public(user, qr_code: Optional[str] = None) -> dict:
    data = WorkerPublic.model_validate(user).model_dump()
    if qr_code:
        data["qr_code"] = qr_code
    return data


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register_worker(
    session: SessionDep,
    full_name: str = Form(...),
    mobile_number: str = Form(...),
    password: str = Form(...),
    email: Optional[str] = Form(None),
    preferred_language: str = Form("en"),
    date_of_birth: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    aadhaar_number: Optional[str] = Form(None),
    current_address_line: Optional[str] = Form(None),
    current_village_or_city: Optional[str] = Form(None),
    current_district: Optional[str] = Form(None),
    current_state: Optional[str] = Form(None),
    current_pincode: Optional[str] = Form(None),
    native_state: Optional[str] = Form(None),
    native_district: Optional[str] = Form(None),
    occupation: Optional[str] = Form(None),
    years_of_experience: Optional[int] = Form(None),
    emergency_contact_name: Optional[str] = Form(None),
    emergency_contact_relation: Optional[str] = Form(None),
    emergency_contact_number: Optional[str] = Form(None),
    profile_photo: Optional[UploadFile] = File(None),
):
    try:
        payload = WorkerRegisterRequest(
            full_name=full_name,
            mobile_number=mobile_number,
            password=password,
            email=email or None,
            preferred_language=preferred_language,
            date_of_birth=datetime.fromisoformat(date_of_birth) if date_of_birth else None,
            gender=gender or None,
            aadhaar_number=aadhaar_number or None,
            current_address_line=current_address_line or None,
            current_village_or_city=current_village_or_city or None,
            current_district=current_district or None,
            current_state=current_state or None,
            current_pincode=current_pincode or None,
            native_state=native_state or None,
            native_district=native_district or None,
            occupation=occupation or None,
            years_of_experience=years_of_experience,
            emergency_contact_name=emergency_contact_name or None,
            emergency_contact_relation=emergency_contact_relation or None,
            emergency_contact_number=emergency_contact_number or None,
        )
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    repo = UserRepository(session)
    service = AuthService(repo)

    photo_bytes = None
    if profile_photo is not None and profile_photo.filename:
        ext = Path(profile_photo.filename).suffix.lower()
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Profile photo must be jpg/jpeg/png/webp")
        photo_bytes = await profile_photo.read()

    user = service.register_worker(payload, profile_photo_path=None)

    if photo_bytes:
        storage = get_storage_service()
        key = storage.save(user.id, profile_photo.filename, photo_bytes)
        user.profile_photo_path = key
        repo.update(user)

    otp_result = OTPService(session).request_otp(user.mobile_number, purpose="registration")
    return RegisterResponse(
        worker_id=user.worker_id,
        mobile_number=user.mobile_number,
        dev_otp=otp_result.get("dev_otp"),
    )


@router.post("/otp/request")
def request_otp(payload: OTPRequest, session: SessionDep):
    return OTPService(session).request_otp(payload.mobile_number, purpose="registration")


@router.post("/otp/verify", response_model=TokenResponse)
def verify_otp(payload: OTPVerifyRequest, session: SessionDep):
    OTPService(session).verify_otp(payload.mobile_number, payload.otp, purpose="registration")

    repo = UserRepository(session)
    service = AuthService(repo)
    user = service.activate_after_otp(payload.mobile_number)

    token = service.issue_token(user)
    qr = AuthService.generate_qr_code_base64(user.worker_id)
    return {"access_token": token, "worker": _to_public(user, qr)}


@router.post("/login", response_model=TokenResponse)
def login_worker(session: SessionDep, payload: WorkerLoginRequest):
    repo = UserRepository(session)
    service = AuthService(repo)
    user = service.authenticate_worker(payload)
    token = service.issue_token(user)
    qr = AuthService.generate_qr_code_base64(user.worker_id)
    return {"access_token": token, "worker": _to_public(user, qr)}


DEV_OTP_CODE = "123456"


@router.post("/government/login", response_model=TokenResponse)
def government_login(session: SessionDep, payload: DevOTPLoginRequest):
    """Government official login. In dev mode, accepts OTP '123456' for any registered mobile.
    Creates a government user on first login if not exists."""
    from app.core.config import settings
    from app.models.user import User, UserRole

    mobile = payload.mobile_number.replace("\D", "")
    otp_code = payload.otp.strip()

    if settings.DEBUG and otp_code == DEV_OTP_CODE:
        repo = UserRepository(session)
        service = AuthService(repo)
        user = service.get_worker_by_mobile(mobile)
        if not user:
            # Create a government user
            user = User(
                full_name=f"Gov Official ({mobile[-4:]})",
                mobile_number=mobile,
                password_hash=hash_password("gov123"),
                role=UserRole.WORKER,  # Using worker role for now
                preferred_language="en",
                is_phone_verified=True,
                is_active=True,
            )
            user = repo.create(user)
        token = service.issue_token(user)
        qr = AuthService.generate_qr_code_base64(user.worker_id)
        return {"access_token": token, "worker": _to_public(user, qr)}

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
@router.post("/otp-login", response_model=TokenResponse)
def otp_login(session: SessionDep, payload: DevOTPLoginRequest):
    """Login with mobile number + OTP.
    In development mode (DEBUG=True), the fixed code '123456' is accepted
    for any registered mobile number, so testers can bypass the real OTP flow.
    In production, the OTP must match a verified record in the database.
    """
    from app.core.config import settings
    repo = UserRepository(session)
    service = AuthService(repo)

    mobile = payload.mobile_number.replace("\D", "")
    otp_code = payload.otp.strip()

    # In DEBUG mode, accept the dev shortcut OTP
    if settings.DEBUG and otp_code == DEV_OTP_CODE:
        user = service.get_worker_by_mobile(mobile)
        if not user:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No worker found with this mobile number")
        token = service.issue_token(user)
        qr = AuthService.generate_qr_code_base64(user.worker_id)
        return {"access_token": token, "worker": _to_public(user, qr)}

    # Production path: verify against real OTP records
    OTPService(session).verify_otp(mobile, otp_code, purpose="login")
    user = service.get_worker_by_mobile(mobile)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No worker found with this mobile number")
    token = service.issue_token(user)
    qr = AuthService.generate_qr_code_base64(user.worker_id)
    return {"access_token": token, "worker": _to_public(user, qr)}


@router.post("/logout")
def logout_worker():
    return {"detail": "Logged out"}


@router.get("/me", response_model=WorkerPublic)
def get_me(current_user: CurrentUser):
    qr = AuthService.generate_qr_code_base64(current_user.worker_id)
    data = WorkerPublic.model_validate(current_user).model_dump()
    data["qr_code"] = qr
    return data
