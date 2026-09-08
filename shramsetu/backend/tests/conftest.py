import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

os.environ["DATABASE_URL"] = "sqlite:///./test_shramsetu.db"
os.environ["JWT_SECRET_KEY"] = "test_secret"
os.environ["OTP_RESEND_COOLDOWN_SECONDS"] = "0"

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel

from app.db.session import engine
from app.main import app


@pytest.fixture(autouse=True)
def _reset_db():
    SQLModel.metadata.create_all(engine)
    yield
    SQLModel.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def register_and_verify(client, mobile="9876543210", **extra):
    """Registers a worker, auto-verifies OTP using the dev_otp echoed back
    (DEBUG=true in test env, no real SMS provider configured), and returns
    the auth headers for the now-active account."""
    payload = {
        "full_name": "Ravi Kumar",
        "mobile_number": mobile,
        "password": "secret123",
        "preferred_language": "hi",
    }
    payload.update(extra)
    reg = client.post("/api/v1/auth/worker/register", data=payload)
    assert reg.status_code == 201, reg.text
    dev_otp = reg.json()["dev_otp"]

    verify = client.post("/api/v1/auth/worker/otp/verify", json={"mobile_number": mobile, "otp": dev_otp})
    assert verify.status_code == 200, verify.text
    token = verify.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, verify.json()["worker"]
