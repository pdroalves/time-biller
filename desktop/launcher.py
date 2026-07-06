from __future__ import annotations

import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import uvicorn
import webview

HOST = "127.0.0.1"
PORT = 8765
SERVER_URL = f"http://{HOST}:{PORT}"
ROOT = Path(__file__).resolve().parent.parent


def _run_server() -> None:
    sys.path.insert(0, str(ROOT / "backend"))
    uvicorn.run("app.main:app", host=HOST, port=PORT, log_level="warning")


def _wait_for_health(timeout: float = 15.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{SERVER_URL}/api/health", timeout=1) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False


def main() -> None:
    threading.Thread(target=_run_server, daemon=True).start()
    if not _wait_for_health():
        print("Server failed to start", file=sys.stderr)
        sys.exit(1)
    tray_proc = subprocess.Popen([sys.executable, str(ROOT / "desktop" / "tray.py")])
    try:
        webview.create_window("Time-Biller", SERVER_URL, width=1100, height=750)
        webview.start()
    finally:
        tray_proc.terminate()


if __name__ == "__main__":
    main()
