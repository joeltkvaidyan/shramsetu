import io


from tests.conftest import register_and_verify


def _auth_headers(client, mobile="9001234567"):
    headers, _ = register_and_verify(client, mobile=mobile, preferred_language="ta")
    return headers


def _file_payload():
    return {
        "category": "unpaid_wages",
        "subject": "Employer has not paid wages for 2 months",
        "description": "I worked at the construction site from March to April but have not been paid.",
        "employer_name": "ABC Constructions",
        "incident_location": "Chennai",
    }


def test_list_categories(client):
    resp = client.get("/api/v1/grievances/categories")
    assert resp.status_code == 200
    assert "unpaid_wages" in resp.json()["categories"]


def test_file_and_list_grievance(client):
    headers = _auth_headers(client)
    resp = client.post("/api/v1/grievances", headers=headers, json=_file_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert body["complaint_number"].startswith("GR-")
    assert body["status"] == "submitted"

    resp = client.get("/api/v1/grievances", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_grievance_detail_has_timeline(client):
    headers = _auth_headers(client)
    created = client.post("/api/v1/grievances", headers=headers, json=_file_payload()).json()

    resp = client.get(f"/api/v1/grievances/{created['id']}", headers=headers)
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["timeline"][0]["status"] == "submitted"
    assert detail["attachments"] == []


def test_upload_and_delete_attachment(client):
    headers = _auth_headers(client)
    created = client.post("/api/v1/grievances", headers=headers, json=_file_payload()).json()
    gid = created["id"]

    files = {"file": ("evidence.jpg", io.BytesIO(b"fake image bytes"), "image/jpeg")}
    resp = client.post(f"/api/v1/grievances/{gid}/attachments", headers=headers, files=files)
    assert resp.status_code == 201
    attachment_id = resp.json()["id"]

    detail = client.get(f"/api/v1/grievances/{gid}", headers=headers).json()
    assert len(detail["attachments"]) == 1

    resp = client.delete(f"/api/v1/grievances/{gid}/attachments/{attachment_id}", headers=headers)
    assert resp.status_code == 204

    detail = client.get(f"/api/v1/grievances/{gid}", headers=headers).json()
    assert len(detail["attachments"]) == 0


def test_attachment_rejects_bad_extension(client):
    headers = _auth_headers(client)
    created = client.post("/api/v1/grievances", headers=headers, json=_file_payload()).json()
    files = {"file": ("evidence.exe", io.BytesIO(b"data"), "application/octet-stream")}
    resp = client.post(f"/api/v1/grievances/{created['id']}/attachments", headers=headers, files=files)
    assert resp.status_code == 400


def test_withdraw_grievance(client):
    headers = _auth_headers(client)
    created = client.post("/api/v1/grievances", headers=headers, json=_file_payload()).json()

    resp = client.post(f"/api/v1/grievances/{created['id']}/withdraw", headers=headers, json={"reason": "Resolved directly with employer"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "withdrawn"

    # Cannot withdraw twice
    resp = client.post(f"/api/v1/grievances/{created['id']}/withdraw", headers=headers, json={})
    assert resp.status_code == 400


def test_cannot_attach_to_withdrawn_grievance(client):
    headers = _auth_headers(client)
    created = client.post("/api/v1/grievances", headers=headers, json=_file_payload()).json()
    client.post(f"/api/v1/grievances/{created['id']}/withdraw", headers=headers, json={})

    files = {"file": ("evidence.jpg", io.BytesIO(b"data"), "image/jpeg")}
    resp = client.post(f"/api/v1/grievances/{created['id']}/attachments", headers=headers, files=files)
    assert resp.status_code == 400


def test_grievance_requires_auth(client):
    resp = client.get("/api/v1/grievances")
    assert resp.status_code == 401


def test_cannot_access_other_workers_grievance(client):
    headers_a = _auth_headers(client, mobile="9001111111")
    headers_b = _auth_headers(client, mobile="9002222222")

    created = client.post("/api/v1/grievances", headers=headers_a, json=_file_payload()).json()
    resp = client.get(f"/api/v1/grievances/{created['id']}", headers=headers_b)
    assert resp.status_code == 404


def test_missing_subject_rejected(client):
    headers = _auth_headers(client)
    payload = _file_payload()
    payload["subject"] = "   "
    resp = client.post("/api/v1/grievances", headers=headers, json=payload)
    assert resp.status_code == 422


def test_grievance_forwarded_to_labour_department(client):
    headers = _auth_headers(client)
    created = client.post("/api/v1/grievances", headers=headers, json=_file_payload()).json()

    detail = client.get(f"/api/v1/grievances/{created['id']}", headers=headers).json()
    forward_notes = [item["note"] for item in detail["timeline"] if item.get("note") and "Forwarded to" in item["note"]]
    assert len(forward_notes) == 1
    assert "Labour Department" in forward_notes[0]


def test_harassment_grievance_forwarded_to_police_and_labour(client):
    headers = _auth_headers(client, mobile="9004444444")
    payload = _file_payload()
    payload["category"] = "harassment_abuse"
    created = client.post("/api/v1/grievances", headers=headers, json=payload).json()

    detail = client.get(f"/api/v1/grievances/{created['id']}", headers=headers).json()
    forward_notes = [item["note"] for item in detail["timeline"] if item.get("note") and "Forwarded to" in item["note"]]
    assert len(forward_notes) == 1
    assert "Labour Department" in forward_notes[0]
    assert "Police Department" in forward_notes[0]


def test_grievance_list_pagination(client):
    headers = _auth_headers(client, mobile="9005555555")
    for _ in range(3):
        client.post("/api/v1/grievances", headers=headers, json=_file_payload())

    resp = client.get("/api/v1/grievances?limit=2&offset=0", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    resp = client.get("/api/v1/grievances?limit=2&offset=2", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
