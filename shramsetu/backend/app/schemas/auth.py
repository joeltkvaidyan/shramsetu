from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.models.user import Gender, Occupation


def _validate_mobile(v: str) -> str:
    digits = "".join(ch for ch in v if ch.isdigit())
    if len(digits) < 10:
        raise ValueError("Mobile number must have at least 10 digits")
    return digits


class WorkerRegisterRequest(BaseModel):
    full_name: str
    mobile_number: str
    email: Optional[EmailStr] = None
    password: str
    preferred_language: str = "en"

    date_of_birth: Optional[datetime] = None
    gender: Optional[Gender] = None
    aadhaar_number: Optional[str] = None

    current_address_line: Optional[str] = None
    current_village_or_city: Optional[str] = None
    current_district: Optional[str] = None
    current_state: Optional[str] = None
    current_pincode: Optional[str] = None

    native_state: Optional[str] = None
    native_district: Optional[str] = None

    occupation: Optional[Occupation] = None
    years_of_experience: Optional[int] = None

    emergency_contact_name: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    emergency_contact_number: Optional[str] = None

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        return _validate_mobile(v)

    @field_validator("emergency_contact_number")
    @classmethod
    def validate_emergency_number(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return _validate_mobile(v)
        return v

    @field_validator("aadhaar_number")
    @classmethod
    def validate_aadhaar(cls, v: Optional[str]) -> Optional[str]:
        if v:
            digits = "".join(ch for ch in v if ch.isdigit())
            if len(digits) != 12:
                raise ValueError("Aadhaar number must be 12 digits")
            return digits
        return v

    @field_validator("current_pincode")
    @classmethod
    def validate_pincode(cls, v: Optional[str]) -> Optional[str]:
        if v and (not v.isdigit() or len(v) != 6):
            raise ValueError("Pincode must be 6 digits")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class RegisterResponse(BaseModel):
    worker_id: str
    mobile_number: str
    message: str = "Registration successful. Please verify your mobile number with the OTP sent."
    dev_otp: Optional[str] = None  # only populated when DEBUG=true, no real SMS provider configured


class OTPRequest(BaseModel):
    mobile_number: str

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        return _validate_mobile(v)


class OTPVerifyRequest(BaseModel):
    mobile_number: str
    otp: str

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        return _validate_mobile(v)


class WorkerLoginRequest(BaseModel):
    mobile_number: str
    password: str


class DevOTPLoginRequest(BaseModel):
    mobile_number: str
    otp: str

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        return _validate_mobile(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    worker: "WorkerPublic"


class WorkerPublic(BaseModel):
    id: int
    worker_id: str
    full_name: str
    mobile_number: str
    email: Optional[str] = None
    role: str
    date_of_birth: Optional[datetime] = None
    gender: Optional[Gender] = None
    aadhaar_number: Optional[str] = None
    current_address_line: Optional[str] = None
    current_village_or_city: Optional[str] = None
    current_district: Optional[str] = None
    current_state: Optional[str] = None
    current_pincode: Optional[str] = None
    native_state: Optional[str] = None
    native_district: Optional[str] = None
    occupation: Optional[Occupation] = None
    years_of_experience: Optional[int] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    emergency_contact_number: Optional[str] = None
    profile_photo_path: Optional[str] = None
    preferred_language: str
    is_phone_verified: bool
    qr_code: Optional[str] = None

    class Config:
        from_attributes = True


TokenResponse.model_rebuild()
