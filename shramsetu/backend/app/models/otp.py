import hashlib
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


class PhoneOTP(SQLModel, table=True):
    """
    Short-lived OTP for mobile number verification during registration.
    Free by design: no paid SMS gateway wired in. See app/services/otp_service.py
    for the pluggable SMSProvider — default is a console/dev provider that
    logs the OTP and (only when DEBUG=true) returns it in the API response
    so the flow is testable without any SMS account at all.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    mobile_number: str = Field(index=True)
    otp_hash: str
    purpose: str = Field(default="registration")

    attempts: int = Field(default=0)
    max_attempts: int = Field(default=5)
    verified: bool = Field(default=False)

    created_at: datetime = Field(default_factory=_now)
    expires_at: datetime = Field(default_factory=lambda: _now() + timedelta(minutes=10))
