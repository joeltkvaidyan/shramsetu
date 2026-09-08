"""
Government authentication service — separate from worker auth.
Government users authenticate with employee_id + password.
No OTP flow (government officials use institutional credentials).
"""
from fastapi import HTTPException, status
from passlib.context import CryptContext

from app.core.security import create_access_token
from app.models.government import GovernmentUser

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class GovernmentAuthService:
    def __init__(self, session):
        self.session = session

    def authenticate(self, employee_id: str, password: str) -> GovernmentUser:
        """Authenticate government user by employee_id + password."""
        user = self.session.query(GovernmentUser).filter(
            GovernmentUser.employee_id == employee_id
        ).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid employee ID or password",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated. Contact administrator.",
            )

        if not pwd_context.verify(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid employee ID or password",
            )

        return user

    def issue_token(self, user: GovernmentUser) -> str:
        """Issue JWT token for government user with role claim."""
        return create_access_token(
            subject=str(user.id),
            extra_claims={
                "role": "government",
                "department": user.department.value if user.department else "general",
                "is_superadmin": user.is_superadmin,
            },
        )

    def register(self, employee_id: str, full_name: str, email: str,
                 mobile_number: str, password: str, department: str = "general",
                 designation: str = None, state: str = None, district: str = None,
                 is_superadmin: bool = False) -> GovernmentUser:
        """Register a new government user (admin only)."""
        # Check for existing
        existing = self.session.query(GovernmentUser).filter(
            (GovernmentUser.employee_id == employee_id) |
            (GovernmentUser.email == email) |
            (GovernmentUser.mobile_number == mobile_number)
        ).first()

        if existing:
            if existing.employee_id == employee_id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Employee ID already registered")
            if existing.email == email:
                raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
            raise HTTPException(status.HTTP_409_CONFLICT, "Mobile number already registered")

        user = GovernmentUser(
            employee_id=employee_id,
            full_name=full_name,
            email=email,
            mobile_number=mobile_number,
            password_hash=pwd_context.hash(password),
            department=department,
            designation=designation,
            state=state,
            district=district,
            is_superadmin=is_superadmin,
        )
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user
