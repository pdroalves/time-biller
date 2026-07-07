#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Load nvm if npm isn't already on PATH (nvm isn't sourced in non-interactive shells).
if ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  if command -v nvm >/dev/null 2>&1; then
    nvm use --lts >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm (Node.js) not found. Install Node 18+ (e.g. via nvm) and retry." >&2
  exit 1
fi

# Pick a Python interpreter (prefer an existing project venv).
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v python >/dev/null 2>&1; then
  PY="python"
else
  echo "Error: Python 3.11+ not found." >&2
  exit 1
fi

( cd frontend && npm install && npm run build )
( cd backend && "$PY" -m pip install -e ".[dev]" )
"$PY" desktop/launcher.py
