import io


from tests.conftest import register_and_verify


def _auth_headers(client):
    headers, _ = register_and_verify(client, mobile="9123456780", preferred_language="bn")
    return headers


def test_upload_list_rename_delete_document(client):
    headers = _auth_headers(client)

    file_content = b"%PDF-1.4 fake pdf content"
    files = {"file": ("aadhar.pdf", io.BytesIO(file_content), "application/pdf")}
    resp = client.post("/api/v1/documents", headers=headers, files=files, data={"display_name": "Aadhar Card"})
    assert resp.status_code == 201
    doc = resp.json()
    assert doc["display_name"] == "Aadhar Card"

    resp = client.get("/api/v1/documents", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    resp = client.patch(f"/api/v1/documents/{doc['id']}", headers=headers, json={"display_name": "Aadhar Updated"})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Aadhar Updated"

    resp = client.delete(f"/api/v1/documents/{doc['id']}", headers=headers)
    assert resp.status_code == 204

    resp = client.get("/api/v1/documents", headers=headers)
    assert len(resp.json()) == 0


def test_upload_rejects_bad_extension(client):
    headers = _auth_headers(client)
    files = {"file": ("virus.exe", io.BytesIO(b"data"), "application/octet-stream")}
    resp = client.post("/api/v1/documents", headers=headers, files=files)
    assert resp.status_code == 400
