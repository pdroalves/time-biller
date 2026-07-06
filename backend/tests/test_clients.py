def test_client_crud(client):
    r = client.post("/api/clients", json={"name": "Acme",
                                          "default_hourly_rate": "100.00"})
    assert r.status_code == 201
    cid = r.json()["id"]
    assert r.json()["default_hourly_rate"] == "100.00"

    assert len(client.get("/api/clients").json()) == 1

    r = client.put(f"/api/clients/{cid}", json={"name": "Acme Inc"})
    assert r.json()["name"] == "Acme Inc"

    r = client.delete(f"/api/clients/{cid}")
    assert r.status_code == 204
    assert client.get("/api/clients").json() == []
