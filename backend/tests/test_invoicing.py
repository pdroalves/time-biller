def _setup(client):
    cid = client.post("/api/clients", json={"name": "Acme",
                                            "default_hourly_rate": "100.00"}).json()["id"]
    pid = client.post("/api/projects", json={"client_id": cid, "name": "Web"}).json()["id"]
    return cid, pid


def test_build_invoice_one_line_per_entry(client):
    cid, pid = _setup(client)
    # 1h and 20min entries in July
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "description": "A",
        "started_at": "2026-07-02T09:00:00Z", "ended_at": "2026-07-02T10:00:00Z"})
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "description": "B",
        "started_at": "2026-07-03T09:00:00Z", "ended_at": "2026-07-03T09:20:00Z"})

    r = client.post("/api/invoices", json={
        "client_id": cid,
        "period_start": "2026-07-01T00:00:00Z",
        "period_end": "2026-07-31T23:59:59Z"})
    assert r.status_code == 201
    inv = r.json()
    assert len(inv["lines"]) == 2
    # 20 min -> 0.25h at 100 = 25.00 ; 1h = 100.00 ; subtotal 125.00
    assert inv["subtotal"] == "125.00"
    assert inv["number"] == "INV-0001"

    # entries now billed and excluded from unbilled listing
    assert client.get(f"/api/time-entries?client_id={cid}&billed=false").json() == []


def test_build_invoice_empty_range_rejected(client):
    cid, _ = _setup(client)
    r = client.post("/api/invoices", json={
        "client_id": cid,
        "period_start": "2026-01-01T00:00:00Z",
        "period_end": "2026-01-31T00:00:00Z"})
    assert r.status_code == 400


def test_invoiced_entry_is_locked(client):
    cid, pid = _setup(client)
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "description": "A",
        "started_at": "2026-07-02T09:00:00Z", "ended_at": "2026-07-02T10:00:00Z"})

    r = client.post("/api/invoices", json={
        "client_id": cid,
        "period_start": "2026-07-01T00:00:00Z",
        "period_end": "2026-07-31T23:59:59Z"})
    assert r.status_code == 201

    billed = client.get(f"/api/time-entries?client_id={cid}&billed=true").json()
    assert len(billed) == 1
    entry_id = billed[0]["id"]

    assert client.put(f"/api/time-entries/{entry_id}",
                      json={"description": "changed"}).status_code == 409
    assert client.delete(f"/api/time-entries/{entry_id}").status_code == 409
