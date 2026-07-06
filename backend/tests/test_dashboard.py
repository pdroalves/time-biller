def test_dashboard(client):
    cid = client.post("/api/clients", json={"name": "Acme",
                                            "default_hourly_rate": "100"}).json()["id"]
    pid = client.post("/api/projects", json={"client_id": cid, "name": "W"}).json()["id"]
    # unbilled 1h
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "started_at": "2026-07-05T09:00:00Z",
        "ended_at": "2026-07-05T10:00:00Z"})
    # billed 1h -> invoice
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "started_at": "2026-07-02T09:00:00Z",
        "ended_at": "2026-07-02T10:00:00Z"})
    client.post("/api/invoices", json={
        "client_id": cid, "period_start": "2026-07-01T00:00:00Z",
        "period_end": "2026-07-03T00:00:00Z"})

    d = client.get("/api/dashboard").json()
    assert d["unbilled_hours"] == "1.00"
    assert d["unbilled_amount"] == "100.00"
    assert d["outstanding_total"] == "100.00"
    assert d["outstanding_count"] == 1
