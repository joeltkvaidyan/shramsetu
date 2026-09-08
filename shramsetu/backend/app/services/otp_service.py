"""
OTP generation/verification for mobile number verification.

Free by design: no paid SMS gateway required to run this project. SMS
sending is behind an abstract SMSProvider so a real provider (e.g. free-tier
Fast2SMS/Twilio trial, or India's free government SMS gateways) can be
plugged in later by implementing one method — nothing else changes.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.models.otp import PhoneOTP, _generate_otp, hash_otp

logger = logging.getLogger("shramsetu.otp")


class SMSProvider(ABC):
    @abstractmethod
    def send(self, mobile_number: str, message: str) -> None: ...


class ConsoleSMSProvider(SMSProvider):
    """Default free provider: logs the OTP instead of sending a real SMS.
    Fine for local dev/demo. Swap for a real provider in production."""

    def send(self, mobile_number: str, message: str) -> None:
        logger.info("[DEV SMS to %s] %s", mobile_number, message)


def get_sms_provider() -> SMSProvider:
    return ConsoleSMSProvider()


class OTPService:
    def __init__(self, session: Session):
        self.session = session
        self.sms = get_sms_provider()

    def request_otp(self, mobile_number: str, purpose: str = "registration") -> dict:
        # Cooldown: prevents a mobile number (or someone spamming a number
        # they don't own) from triggering unlimited OTP sends, which would
        # both be an abuse vector and burn through free-tier SMS quota.
        recent_stmt = (
            select(PhoneOTP)
            .where(PhoneOTP.mobile_number == mobile_number, PhoneOTP.purpose == purpose)
            .order_by(PhoneOTP.created_at.desc())
        )
        most_recent = self.session.exec(recent_stmt).first()
        if most_recent:
            elapsed = (datetime.now(timezone.utc) - most_recent.created_at.replace(tzinfo=timezone.utc)).total_seconds()
            if elapsed < settings.OTP_RESEND_COOLDOWN_SECONDS:
                wait = int(settings.OTP_RESEND_COOLDOWN_SECONDS - elapsed)
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    f"Please wait {wait} seconds before requesting another code",
                )

        otp = _generate_otp()
        record = PhoneOTP(mobile_number=mobile_number, otp_hash=hash_otp(otp), purpose=purpose)
        self.session.add(record)
        self.session.commit()

        self.sms.send(mobile_number, f"Your ShramSetu verification code is {otp}. Valid for 10 minutes.")

        response = {"message": "OTP sent", "expires_in_seconds": 600}
        if settings.DEBUG:
            # Dev convenience only — no real SMS provider is configured, so
            # the OTP is echoed back to make the flow testable end-to-end.
            # MUST be removed/disabled once a real SMSProvider is wired in.
            response["dev_otp"] = otp
        return response

    def verify_otp(self, mobile_number: str, otp: str, purpose: str = "registration") -> None:
        stmt = (
            select(PhoneOTP)
            .where(PhoneOTP.mobile_number == mobile_number, PhoneOTP.purpose == purpose, PhoneOTP.verified == False)  # noqa: E712
            .order_by(PhoneOTP.created_at.desc())
        )
        record = self.session.exec(stmt).first()

        if not record:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No pending OTP for this mobile number")

        if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "OTP expired. Please request a new one")

        if record.attempts >= record.max_attempts:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please request a new OTP")

        record.attempts += 1
        if record.otp_hash != hash_otp(otp):
            self.session.add(record)
            self.session.commit()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect OTP")

        record.verified = True
        self.session.add(record)
        self.session.commit()
