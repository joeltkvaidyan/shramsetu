import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_worker_id() -> str:
    # e.g. SS-7F3A9C21  (SS = ShramSetu)
    return f"SS-{uuid.uuid4().hex[:8].upper()}"


class UserRole(str, Enum):
    WORKER = "worker"
    EMPLOYER = "employer"
    GOVERNMENT = "government"
    INSURANCE = "insurance"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class Occupation(str, Enum):
    CONSTRUCTION = "construction"
    DOMESTIC_WORK = "domestic_work"
    AGRICULTURE = "agriculture"
    TEXTILE_GARMENT = "textile_garment"
    FACTORY_WORKER = "factory_worker"
    DRIVER_TRANSPORT = "driver_transport"
    STREET_VENDOR = "street_vendor"
    SECURITY_GUARD = "security_guard"
    HOSPITALITY = "hospitality"
    OTHER = "other"


class User(SQLModel, table=True):
    """
    Phase 1 only fully implements the WORKER role. Employer / Government /
    Insurance rows can be created (so the schema won't need breaking changes
    later) but the API only exposes worker-facing endpoints for now.

    Profile fields below capture the details a migrant worker realistically
    needs to provide for welfare-scheme eligibility and emergency contact
    purposes: identity, current work-site address, native/home address
    (distinct — the whole point of "migrant" worker), occupation, and an
    emergency contact.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    worker_id: str = Field(default_factory=_new_worker_id, unique=True, index=True)

    full_name: str
    mobile_number: str = Field(unique=True, index=True)
    email: Optional[str] = Field(default=None, unique=True, index=True)
    password_hash: str
    role: UserRole = Field(default=UserRole.WORKER)

    date_of_birth: Optional[datetime] = None
    gender: Optional[Gender] = None
    aadhaar_number: Optional[str] = None  # stored as provided; NOT verified against UIDAI in Phase 1/2

    # Current (work-site) address
    current_address_line: Optional[str] = None
    current_village_or_city: Optional[str] = None
    current_district: Optional[str] = None
    current_state: Optional[str] = None
    current_pincode: Optional[str] = None

    # Native/home address — distinct from current address since this is a
    # migrant-worker platform; welfare schemes often depend on home state.
    native_state: Optional[str] = None
    native_district: Optional[str] = None

    occupation: Optional[Occupation] = None
    years_of_experience: Optional[int] = None

    emergency_contact_name: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    emergency_contact_number: Optional[str] = None

    profile_photo_path: Optional[str] = None
    preferred_language: str = Field(default="en")

    is_phone_verified: bool = Field(default=False)
    is_active: bool = Field(default=False)  # activated only after OTP verification
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
