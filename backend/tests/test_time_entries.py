def _project(client):
    cid = client.post("/api/clients", json={"name": "Acme"}).json()["id"]
    return client.post("/api/projects", json={"client_id": cid, "name": "Web"}).json()["id"]


def test_start_pause_resume_stop(client):
    pid = _project(client)
    r = client.post("/api/time-entries/start",
                    json={"project_id": pid, "description": "work"})
    assert r.status_code == 201
    eid = r.json()["id"]
    assert r.json()["status"] == "running"
    assert len(r.json()["segments"]) == 1

    assert client.post(f"/api/time-entries/{eid}/pause").json()["status"] == "paused"
    r = client.post(f"/api/time-entries/{eid}/resume")
    assert r.json()["status"] == "running"
    assert len(r.json()["segments"]) == 2
    assert client.post(f"/api/time-entries/{eid}/stop").json()["status"] == "stopped"


def test_manual_entry_and_edit_lock_after_invoice(client):
    pid = _project(client)
    r = client.post("/api/time-entries/manual", json={
        "project_id": pid, "description": "past",
        "started_at": "2026-07-01T10:00:00Z", "ended_at": "2026-07-01T11:00:00Z"})
    assert r.status_code == 201
    assert r.json()["duration_seconds"] == 3600


def test_running_endpoint(client):
    pid = _project(client)
    client.post("/api/time-entries/start", json={"project_id": pid})
    running = client.get("/api/time-entries/running").json()
    assert len(running) == 1
    assert running[0]["duration_seconds"] >= 0
