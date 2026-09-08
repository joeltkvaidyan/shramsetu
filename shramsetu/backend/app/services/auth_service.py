from __future__ import annotations

import base64
import io

import qrcode
from fastapi import HTTPException, status

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import WorkerLoginRequest, WorkerRegisterRequest


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    def register_worker(self, payload: WorkerRegisterRequest, profile_photo_path: str | None) -> User:
        if self.user_repo.get_by_mobile(payload.mobile_number):
            raise HTTPException(status.HTTP_409_CONFLICT, "Mobile number already registered")

        user = User(
            full_name=payload.full_name.strip(),
            mobile_number=payload.mobile_number,
            email=payload.email,
            password_hash=hash_password(payload.password),
            role=UserRole.WORKER,
            preferred_language=payload.preferred_language,
            date_of_birth=payload.date_of_birth,
            gender=payload.gender,
            aadhaar_number=payload.aadhaar_number,
            current_address_line=payload.current_address_line,
            current_village_or_city=payload.current_village_or_city,
            current_district=payload.current_district,
            current_state=payload.current_state,
            current_pincode=payload.current_pincode,
            native_state=payload.native_state,
            native_district=payload.native_district,
            occupation=payload.occupation,
            years_of_experience=payload.years_of_experience,
            emergency_contact_name=payload.emergency_contact_name,
            emergency_contact_relation=payload.emergency_contact_relation,
            emergency_contact_number=payload.emergency_contact_number,
            profile_photo_path=profile_photo_path,
            is_phone_verified=False,
            is_active=False,  # activated only once OTP is verified
        )
        try:
            return self.user_repo.create(user)
        except Exception as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, "Could not register (duplicate mobile/email)") from exc

    def activate_after_otp(self, mobile_number: str) -> User:
        user = self.user_repo.get_by_mobile(mobile_number)
        if not user:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No registration found for this mobile number")
        user.is_phone_verified = True
        user.is_active = True
        return self.user_repo.update(user)

    def get_worker_by_mobile(self, mobile_number: str) -> User | None:
        return self.user_repo.get_by_mobile(mobile_number)

    def authenticate_worker(self, payload: WorkerLoginRequest) -> User:
        user = self.user_repo.get_by_mobile(payload.mobile_number)
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid mobile number or password")
        if not user.is_phone_verified:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Mobile number not verified. Please verify OTP first")
        if not user.is_active:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is deactivated")
        return user

    def issue_token(self, user: User) -> str:
        return create_access_token(subject=str(user.id), extra_claims={"role": user.role.value})

    @staticmethod
    def generate_qr_code_base64(worker_id: str) -> str:
        img = qrcode.make(worker_id)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{encoded}"
