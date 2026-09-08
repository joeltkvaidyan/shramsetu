from tests.conftest import register_and_verify


def _register_payload(mobile="9876543210"):
    return {
        "full_name": "Ravi Kumar",
        "mobile_number": mobile,
        "password": "secret123",
        "email": "ravi@example.com",
        "preferred_language": "hi",
        "date_of_birth": "1995-06-15",
        "gender": "male",
        "current_address_line": "12 MG Road",
        "current_village_or_city": "Whitefield",
        "current_district": "Bengaluru Urban",
        "current_state": "Karnataka",
        "current_pincode": "560066",
        "native_state": "Bihar",
        "native_district": "Gaya",
        "occupation": "construction",
        "years_of_experience": "5",
        "emergency_contact_name": "Sita Devi",
        "emergency_contact_relation": "Spouse",
        "emergency_contact_number": "9123456789",
    }


def test_register_creates_inactive_unverified_worker(client):
    resp = client.post("/api/v1/auth/worker/register", data=_register_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert body["worker_id"].startswith("SS-")
    assert body["mobile_number"] == "9876543210"
    assert "dev_otp" in body and len(body["dev_otp"]) == 6


def test_login_blocked_before_otp_verification(client):
    client.post("/api/v1/auth/worker/register", data=_register_payload())
    resp = client.post(
        "/api/v1/auth/worker/login", json={"mobile_number": "9876543210", "password": "secret123"}
    )
    assert resp.status_code == 403


def test_otp_verify_activates_and_logs_in(client):
    reg = client.post("/api/v1/auth/worker/register", data=_register_payload())
    dev_otp = reg.json()["dev_otp"]

    resp = client.post(
        "/api/v1/auth/worker/otp/verify", json={"mobile_number": "9876543210", "otp": dev_otp}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["worker"]["is_phone_verified"] is True
    assert body["worker"]["occupation"] == "construction"
    assert body["worker"]["native_state"] == "Bihar"


def test_wrong_otp_rejected(client):
    client.post("/api/v1/auth/worker/register", data=_register_payload())
    resp = client.post(
        "/api/v1/auth/worker/otp/verify", json={"mobile_number": "9876543210", "otp": "000000"}
    )
    assert resp.status_code == 400


def test_login_after_verification_succeeds(client):
    headers, worker = register_and_verify(client)
    resp = client.post(
        "/api/v1/auth/worker/login", json={"mobile_number": "9876543210", "password": "secret123"}
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]


def test_login_wrong_password(client):
    register_and_verify(client)
    resp = client.post(
        "/api/v1/auth/worker/login", json={"mobile_number": "9876543210", "password": "wrong"}
    )
    assert resp.status_code == 401


def test_duplicate_mobile_registration_fails(client):
    client.post("/api/v1/auth/worker/register", data=_register_payload())
    resp = client.post("/api/v1/auth/worker/register", data=_register_payload())
    assert resp.status_code == 409


def test_get_me_requires_auth(client):
    resp = client.get("/api/v1/auth/worker/me")
    assert resp.status_code == 401


def test_get_me_with_token(client):
    headers, _ = register_and_verify(client)
    resp = client.get("/api/v1/auth/worker/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["mobile_number"] == "9876543210"


def test_invalid_aadhaar_rejected(client):
    payload = _register_payload(mobile="9111111111")
    payload["aadhaar_number"] = "12345"
    resp = client.post("/api/v1/auth/worker/register", data=payload)
    assert resp.status_code == 422


def test_invalid_pincode_rejected(client):
    payload = _register_payload(mobile="9222222222")
    payload["current_pincode"] = "123"
    resp = client.post("/api/v1/auth/worker/register", data=payload)
    assert resp.status_code == 422
