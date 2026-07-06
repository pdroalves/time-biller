def _make_client(client):
    return client.post("/api/clients", json={"name": "Acme"}).json()["id"]


def test_project_crud_and_client_filter(client):
    cid = _make_client(client)
    r = client.post("/api/projects", json={"client_id": cid, "name": "Web",
                                           "hourly_rate_override": "150.00"})
    assert r.status_code == 201
    pid = r.json()["id"]
    assert r.json()["hourly_rate_override"] == "150.00"

    assert len(client.get(f"/api/projects?client_id={cid}").json()) == 1

    r = client.post("/api/projects", json={"client_id": 999, "name": "X"})
    assert r.status_code == 404


def test_project_get_update_and_missing(client):
    cid = _make_client(client)
    pid = client.post("/api/projects",
                      json={"client_id": cid, "name": "Web"}).json()["id"]

    r = client.get(f"/api/projects/{pid}")
    assert r.status_code == 200
    assert r.json()["name"] == "Web"

    r = client.put(f"/api/projects/{pid}", json={"name": "Web v2"})
    assert r.status_code == 200
    assert r.json()["name"] == "Web v2"

    assert client.get("/api/projects/999").status_code == 404


def test_project_delete_hard_deletes_without_entries(client):
    cid = _make_client(client)
    pid = client.post("/api/projects",
                      json={"client_id": cid, "name": "Web"}).json()["id"]

    r = client.delete(f"/api/projects/{pid}")
    assert r.status_code == 204
    assert client.get(f"/api/projects/{pid}").status_code == 404
    # A project with no time entries is hard-deleted, so it disappears even
    # when archived rows are requested.
    assert client.get("/api/projects?include_archived=true").json() == []
    # NOTE: The soft-delete/archive branch (delete a project that has time
    # entries -> archived=True instead of removed) cannot be exercised here
    # because there is no API to create TimeEntry rows yet. It will be covered
    # once the time-entry endpoints land in Task 7.


def test_project_list_excludes_archived_by_default(client):
    cid = _make_client(client)
    pid = client.post("/api/projects",
                      json={"client_id": cid, "name": "Web"}).json()["id"]

    client.put(f"/api/projects/{pid}", json={"archived": True})

    assert client.get("/api/projects").json() == []
    assert len(client.get("/api/projects?include_archived=true").json()) == 1
