def test_settings_defaults_and_update(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["rounding_increment_minutes"] == 15
    assert data["invoice_number_prefix"] == "INV-"

    resp = client.put("/api/settings", json={"business_name": "Pedro LLC",
                                             "currency_symbol": "€"})
    assert resp.status_code == 200
    assert resp.json()["business_name"] == "Pedro LLC"
    assert client.get("/api/settings").json()["currency_symbol"] == "€"
