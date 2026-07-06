def test_invoice_pdf_download(client):
    cid = client.post("/api/clients", json={"name": "Acme",
                                            "default_hourly_rate": "100"}).json()["id"]
    pid = client.post("/api/projects", json={"client_id": cid, "name": "W"}).json()["id"]
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "started_at": "2026-07-02T09:00:00Z",
        "ended_at": "2026-07-02T10:00:00Z"})
    iid = client.post("/api/invoices", json={
        "client_id": cid, "period_start": "2026-07-01T00:00:00Z",
        "period_end": "2026-07-31T00:00:00Z"}).json()["id"]

    r = client.get(f"/api/invoices/{iid}/pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
