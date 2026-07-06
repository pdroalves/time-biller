def _invoice(client):
    cid = client.post("/api/clients", json={"name": "Acme",
                                            "default_hourly_rate": "100"}).json()["id"]
    pid = client.post("/api/projects", json={"client_id": cid, "name": "W"}).json()["id"]
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "started_at": "2026-07-02T09:00:00Z",
        "ended_at": "2026-07-02T10:00:00Z"})
    return client.post("/api/invoices", json={
        "client_id": cid, "period_start": "2026-07-01T00:00:00Z",
        "period_end": "2026-07-31T00:00:00Z"}).json()["id"]


def test_status_transitions(client):
    iid = _invoice(client)
    r = client.put(f"/api/invoices/{iid}/status", json={"status": "sent"})
    assert r.status_code == 200
    assert r.json()["status"] == "sent"
    assert client.put(f"/api/invoices/{iid}/status",
                      json={"status": "paid"}).json()["status"] == "paid"
    assert client.put(f"/api/invoices/{iid}/status",
                      json={"status": "bogus"}).status_code == 422


def test_status_missing_invoice_404(client):
    assert client.put("/api/invoices/999999/status", json={"status": "sent"}).status_code == 404
