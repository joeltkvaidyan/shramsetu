from fastapi import APIRouter

router = APIRouter(prefix="/roles", tags=["Other Roles"])

_COMING_SOON = {
    "employer": "Employer portal is coming soon.",
    "government": "Government/NGO portal is coming soon.",
    "insurance": "Insurance provider portal is coming soon.",
}


@router.get("/{role}/status")
def role_status(role: str):
    if role not in _COMING_SOON:
        return {"role": role, "implemented": False, "message": "Unknown role."}
    return {"role": role, "implemented": False, "message": _COMING_SOON[role]}
