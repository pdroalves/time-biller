from __future__ import annotations

import json
import urllib.request

BASE = "http://127.0.0.1:8765/api"


def _req(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=3) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def running():
    return _req("GET", "/time-entries/running")


def pause(eid: int):
    return _req("POST", f"/time-entries/{eid}/pause")


def resume(eid: int):
    return _req("POST", f"/time-entries/{eid}/resume")


def stop(eid: int):
    return _req("POST", f"/time-entries/{eid}/stop")


def start(project_id: int):
    return _req("POST", "/time-entries/start", {"project_id": project_id})


def clients():
    return _req("GET", "/clients")


def projects(client_id: int):
    return _req("GET", f"/projects?client_id={client_id}")
