def _register(client, mobile="9333333333"):
    return client.post(
        "/api/v1/auth/worker/register",
        data={
            "full_name": "Test Worker",
            "mobile_number": mobile,
            "password": "secret123",
        },
    )


def test_otp_max_attempts_locks_out(client):
    reg = _register(client)
    mobile = reg.json()["mobile_number"]

    for _ in range(5):
        resp = client.post("/api/v1/auth/worker/otp/verify", json={"mobile_number": mobile, "otp": "000000"})
        assert resp.status_code == 400

    # 6th attempt should be rate limited, not just wrong-OTP
    resp = client.post("/api/v1/auth/worker/otp/verify", json={"mobile_number": mobile, "otp": "000000"})
    assert resp.status_code == 429


def test_otp_resend_issues_new_code(client):
    reg = _register(client)
    mobile = reg.json()["mobile_number"]
    old_otp = reg.json()["dev_otp"]

    resend = client.post("/api/v1/auth/worker/otp/request", json={"mobile_number": mobile})
    assert resend.status_code == 200
    new_otp = resend.json()["dev_otp"]

    # Old OTP should now be superseded — only the latest is checked
    verify_new = client.post("/api/v1/auth/worker/otp/verify", json={"mobile_number": mobile, "otp": new_otp})
    assert verify_new.status_code == 200


def test_verify_otp_for_unregistered_number_fails(client):
    resp = client.post("/api/v1/auth/worker/otp/verify", json={"mobile_number": "9999999999", "otp": "123456"})
    assert resp.status_code == 400


def test_otp_resend_cooldown_blocks_rapid_requests(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "OTP_RESEND_COOLDOWN_SECONDS", 30)
    reg = _register(client, mobile="9444444444")
    assert reg.status_code == 201

    # Registration itself already sent one OTP; an immediate resend should
    # be blocked by the cooldown.
    resp = client.post("/api/v1/auth/worker/otp/request", json={"mobile_number": "9444444444"})
    assert resp.status_code == 429
