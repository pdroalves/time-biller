# syntax=docker/dockerfile:1

# --- Stage 1: build the React/Vite frontend ---
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: python runtime serving API + built SPA ---
FROM python:3.12-slim AS runtime

# System libraries required by WeasyPrint (loaded at import time).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libpangoft2-1.0-0 \
      libgdk-pixbuf-2.0-0 \
      libcairo2 \
      libffi8 \
      libglib2.0-0 \
      libharfbuzz0b \
      libfontconfig1 \
      fonts-dejavu-core \
      shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TIME_BILLER_DB=/data/time_biller.db

WORKDIR /app

# Install backend dependencies (editable so the app runs from source,
# keeping the frontend/dist relative path resolution intact).
COPY backend/ /app/backend/
RUN pip install --no-cache-dir -e /app/backend

# Built SPA is served by FastAPI from ../../frontend/dist relative to app/main.py.
COPY --from=frontend /fe/dist /app/frontend/dist

VOLUME ["/data"]
EXPOSE 8765
WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/api/health',timeout=3).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
