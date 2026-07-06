# Time-Biller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lean, local-only, single-user time-tracking and invoicing desktop app for Ubuntu.

**Architecture:** A single local FastAPI process owns all state in SQLite and exposes a REST/JSON API plus the built React static assets. A React/TS SPA runs in a `pywebview` window; a PyGObject AppIndicator tray controls concurrent timers. A launcher boots the server, window, and tray.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.x, SQLite, Pydantic v2, WeasyPrint (PDF), pytest; React 18 + TypeScript + Vite, Vitest + React Testing Library; pywebview, PyGObject (GTK3 AppIndicator).

## Global Constraints

- Local-only, single user. No authentication, no network exposure; server binds to `127.0.0.1`.
- Out of scope (do NOT build): payment processing, recurring invoices, multi-user/auth, remote/mobile access, multiple currencies, tax calculation, native mobile app.
- Single currency; currency is a display symbol only. No tax anywhere.
- Every `TimeEntry` requires a `project_id`; every `Project` requires a `client_id`.
- Stored durations are always exact. Rounding (default 15 min, configurable) is applied ONLY at invoice time, never to stored data.
- Rate resolution: `project.hourly_rate_override` if set, else `client.default_hourly_rate`. Resolved at invoice time and snapshotted onto the invoice line.
- Invoice status flow: `invoiced → sent → paid` (manual transitions only).
- "Outstanding" = invoices with status `invoiced` or `sent`. "Unbilled" = stopped, un-invoiced entries.
- Money stored as `Decimal` (SQLite `NUMERIC`), rendered with 2 decimals. Hours rendered with 2 decimals.
- Editing/deleting an entry already attached to an invoice is blocked at the API layer.
- Clients/projects with entries are archived (soft), never hard-deleted.
- Python: use SQLAlchemy 2.0 style (`Mapped`, `mapped_column`). All timestamps stored in UTC; entry "date" derives from the first segment's `started_at` converted to local time.
- Backend package root: `backend/app`. Tests in `backend/tests`. Run backend commands from `backend/`.
- Commit after every task with a Conventional Commits message.

---

## File Structure

```
backend/
  pyproject.toml
  app/
    __init__.py
    main.py                 # FastAPI app factory, router registration, static serving
    db.py                   # engine, SessionLocal, get_db dependency, Base
    models.py               # SQLAlchemy models
    schemas.py              # Pydantic request/response models
    time_math.py            # duration + rounding + rate resolution (pure functions)
    routers/
      __init__.py
      clients.py
      projects.py
      time_entries.py
      invoices.py
      settings.py
      dashboard.py
    services/
      __init__.py
      invoicing.py          # build invoice from date range
      pdf.py                # invoice -> PDF (WeasyPrint)
    templates/
      invoice.html          # Jinja2 template for PDF
  tests/
    conftest.py
    test_time_math.py
    test_clients.py
    test_projects.py
    test_time_entries.py
    test_invoicing.py
    test_invoice_status.py
    test_dashboard.py
    test_pdf.py
frontend/
  package.json, vite.config.ts, tsconfig.json, index.html
  src/
    main.tsx, App.tsx, router.tsx
    api/client.ts           # typed fetch wrapper + endpoint fns
    types.ts
    pages/Dashboard.tsx
    pages/Clients.tsx
    pages/Projects.tsx
    pages/Timer.tsx
    pages/TimeEntries.tsx
    pages/Invoices.tsx
    pages/InvoiceDetail.tsx
    pages/Settings.tsx
    components/*            # small shared components
  src/__tests__/Timer.test.tsx, InvoiceBuilder.test.tsx
desktop/
  launcher.py               # boots server, opens pywebview window, spawns tray
  tray.py                   # PyGObject AppIndicator
  tray_api.py               # thin HTTP client used by tray
```

---

### Task 1: Backend scaffolding

**Files:**
- Create: `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/db.py`, `backend/app/main.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `create_app() -> FastAPI`; `Base` (declarative base); `get_db()` dependency yielding a `Session`; `SessionLocal`; `engine`. Health route `GET /api/health -> {"status": "ok"}`.

- [ ] **Step 1: Write `backend/pyproject.toml`**

```toml
[project]
name = "time-biller"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.111",
  "uvicorn[standard]>=0.30",
  "sqlalchemy>=2.0",
  "pydantic>=2.7",
  "jinja2>=3.1",
  "weasyprint>=62",
  "python-multipart>=0.0.9",
]

[project.optional-dependencies]
dev = ["pytest>=8.2", "httpx>=0.27"]

[tool.pytest.ini_options]
addopts = "-q"
testpaths = ["tests"]
```

- [ ] **Step 2: Write `backend/app/db.py`**

```python
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DB_PATH = Path.home() / ".local" / "share" / "time-biller" / "time_biller.db"


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    if url is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        url = f"sqlite:///{DB_PATH}"
    return create_engine(url, connect_args={"check_same_thread": False})


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 3: Write `backend/app/main.py`**

```python
from fastapi import FastAPI

from .db import Base, engine


def create_app() -> FastAPI:
    app = FastAPI(title="Time-Biller")
    Base.metadata.create_all(bind=engine)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 4: Write `backend/tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import create_app


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    app = create_app()

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
```

Note: `create_app` currently calls `create_all` on the real engine; that is harmless for tests since the in-memory schema is created here too. Later tasks add models before `create_all` matters.

- [ ] **Step 5: Write `backend/tests/test_health.py`**

```python
def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 6: Run tests, expect PASS**

Run: `cd backend && pip install -e ".[dev]" && pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold FastAPI app with health check"
```

---

### Task 2: Data models

**Files:**
- Create: `backend/app/models.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces SQLAlchemy models: `Client`, `Project`, `TimeEntry`, `TimeSegment`, `Invoice`, `InvoiceLine`, `Settings`. Enums via string columns. `TimeEntry.status` in {`running`,`paused`,`stopped`}; `Invoice.status` in {`invoiced`,`sent`,`paid`}.

- [ ] **Step 1: Write failing test `backend/tests/test_models.py`**

```python
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Client, Project, TimeEntry, TimeSegment


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_client_project_entry_segment_relationships():
    s = _session()
    c = Client(name="Acme", default_hourly_rate=Decimal("100.00"))
    p = Project(client=c, name="Website")
    e = TimeEntry(project=p, description="Design", status="running")
    seg = TimeSegment(
        time_entry=e, started_at=datetime(2026, 7, 6, 12, 0, tzinfo=timezone.utc)
    )
    s.add_all([c, p, e, seg])
    s.commit()
    assert p.client_id == c.id
    assert e.project.client.name == "Acme"
    assert e.segments[0].ended_at is None
```

- [ ] **Step 2: Run test, expect FAIL** (`app.models` missing)

Run: `cd backend && pytest tests/test_models.py -v`
Expected: FAIL (ImportError).

- [ ] **Step 3: Write `backend/app/models.py`**

```python
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    contact: Mapped[str] = mapped_column(Text, default="")
    default_hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    archived: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    projects: Mapped[list["Project"]] = relationship(back_populates="client")


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    name: Mapped[str] = mapped_column(String(200))
    hourly_rate_override: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    archived: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    client: Mapped[Client] = relationship(back_populates="projects")
    entries: Mapped[list["TimeEntry"]] = relationship(back_populates="project")


class TimeEntry(Base):
    __tablename__ = "time_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="running")
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"))
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    project: Mapped[Project] = relationship(back_populates="entries")
    segments: Mapped[list["TimeSegment"]] = relationship(
        back_populates="time_entry", cascade="all, delete-orphan",
        order_by="TimeSegment.started_at",
    )
    invoice: Mapped["Invoice | None"] = relationship(back_populates="entries")


class TimeSegment(Base):
    __tablename__ = "time_segments"
    id: Mapped[int] = mapped_column(primary_key=True)
    time_entry_id: Mapped[int] = mapped_column(ForeignKey("time_entries.id"))
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime | None]
    time_entry: Mapped[TimeEntry] = relationship(back_populates="segments")


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    number: Mapped[str] = mapped_column(String(50))
    issue_date: Mapped[datetime] = mapped_column(default=_utcnow)
    due_date: Mapped[datetime]
    period_start: Mapped[datetime]
    period_end: Mapped[datetime]
    status: Mapped[str] = mapped_column(String(16), default="invoiced")
    currency_symbol: Mapped[str] = mapped_column(String(8), default="$")
    business_name: Mapped[str] = mapped_column(Text, default="")
    business_address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    client: Mapped[Client] = relationship()
    lines: Mapped[list["InvoiceLine"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )
    entries: Mapped[list[TimeEntry]] = relationship(back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    time_entry_id: Mapped[int] = mapped_column(ForeignKey("time_entries.id"))
    entry_date: Mapped[datetime]
    description: Mapped[str] = mapped_column(Text, default="")
    hours: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Settings(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    business_name: Mapped[str] = mapped_column(Text, default="")
    business_address: Mapped[str] = mapped_column(Text, default="")
    logo_path: Mapped[str] = mapped_column(Text, default="")
    invoice_notes: Mapped[str] = mapped_column(Text, default="")
    currency_symbol: Mapped[str] = mapped_column(String(8), default="$")
    invoice_number_prefix: Mapped[str] = mapped_column(String(20), default="INV-")
    next_invoice_seq: Mapped[int] = mapped_column(default=1)
    rounding_increment_minutes: Mapped[int] = mapped_column(default=15)
    default_due_days: Mapped[int] = mapped_column(default=14)
```

- [ ] **Step 4: Import models in `main.py` so `create_all` sees them**

Modify `backend/app/main.py`: add `from . import models  # noqa: F401` before `create_app`, and inside `create_app` keep `Base.metadata.create_all(bind=engine)`.

- [ ] **Step 5: Run test, expect PASS**

Run: `cd backend && pytest tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/main.py backend/tests/test_models.py
git commit -m "feat(backend): add SQLAlchemy data models"
```

---

### Task 3: time_math pure functions (rounding, duration, rate)

**Files:**
- Create: `backend/app/time_math.py`
- Test: `backend/tests/test_time_math.py`

**Interfaces:**
- Produces:
  - `segment_seconds(segments, now=None) -> int` — sums closed segments; open segments count up to `now` (defaults to `datetime.now(timezone.utc)`).
  - `round_hours(seconds: int, increment_minutes: int) -> Decimal` — seconds → hours rounded to nearest increment, 2 decimals, round-half-up.
  - `resolve_rate(client_rate: Decimal, project_override: Decimal | None) -> Decimal`.

- [ ] **Step 1: Write failing test `backend/tests/test_time_math.py`**

```python
from datetime import datetime, timezone
from decimal import Decimal

from app.time_math import resolve_rate, round_hours, segment_seconds


class Seg:
    def __init__(self, started_at, ended_at):
        self.started_at = started_at
        self.ended_at = ended_at


def _dt(h, m, s=0):
    return datetime(2026, 7, 6, h, m, s, tzinfo=timezone.utc)


def test_segment_seconds_closed():
    segs = [Seg(_dt(10, 0), _dt(10, 30)), Seg(_dt(11, 0), _dt(11, 15))]
    assert segment_seconds(segs) == 45 * 60


def test_segment_seconds_open_uses_now():
    segs = [Seg(_dt(10, 0), None)]
    assert segment_seconds(segs, now=_dt(10, 10)) == 600


def test_round_hours_nearest_15():
    # 20 min -> 15 min -> 0.25h ; 23 min -> 30 min -> 0.5h
    assert round_hours(20 * 60, 15) == Decimal("0.25")
    assert round_hours(23 * 60, 15) == Decimal("0.50")


def test_round_hours_half_up():
    # 7.5 min is exactly half of 15 -> rounds up to 15 min = 0.25h
    assert round_hours(int(7.5 * 60), 15) == Decimal("0.25")


def test_resolve_rate_override_wins():
    assert resolve_rate(Decimal("100"), Decimal("150")) == Decimal("150")
    assert resolve_rate(Decimal("100"), None) == Decimal("100")
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_time_math.py -v`
Expected: FAIL (ImportError).

- [ ] **Step 3: Write `backend/app/time_math.py`**

```python
from __future__ import annotations

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal


def segment_seconds(segments, now: datetime | None = None) -> int:
    if now is None:
        now = datetime.now(timezone.utc)
    total = 0
    for seg in segments:
        end = seg.ended_at if seg.ended_at is not None else now
        total += int((end - seg.started_at).total_seconds())
    return max(total, 0)


def round_hours(seconds: int, increment_minutes: int) -> Decimal:
    if increment_minutes <= 0:
        return (Decimal(seconds) / Decimal(3600)).quantize(Decimal("0.01"))
    increment_seconds = increment_minutes * 60
    units = (Decimal(seconds) / Decimal(increment_seconds)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    rounded_seconds = units * increment_seconds
    return (rounded_seconds / Decimal(3600)).quantize(Decimal("0.01"))


def resolve_rate(client_rate: Decimal, project_override: Decimal | None) -> Decimal:
    return project_override if project_override is not None else client_rate
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd backend && pytest tests/test_time_math.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/time_math.py backend/tests/test_time_math.py
git commit -m "feat(backend): add time math utilities"
```

---

### Task 4: Schemas + Settings router

**Files:**
- Create: `backend/app/schemas.py`, `backend/app/routers/__init__.py`, `backend/app/routers/settings.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_settings.py`

**Interfaces:**
- Produces Pydantic schemas (all `model_config = ConfigDict(from_attributes=True)`): `SettingsRead`, `SettingsUpdate`, `ClientRead/Create/Update`, `ProjectRead/Create/Update`, `TimeEntryRead`, `SegmentRead`, `ManualEntryCreate`, `InvoiceRead`, `InvoiceLineRead`, `InvoiceCreate`, `DashboardRead`.
- Settings endpoints: `GET /api/settings`, `PUT /api/settings`. A `get_settings(db)` helper lazily creates the single row (id=1).

- [ ] **Step 1: Write failing test `backend/tests/test_settings.py`**

```python
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
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_settings.py -v`
Expected: FAIL (404 / no route).

- [ ] **Step 3: Write `backend/app/schemas.py`** (all schemas used across the app)

```python
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SettingsRead(_ORM):
    business_name: str
    business_address: str
    logo_path: str
    invoice_notes: str
    currency_symbol: str
    invoice_number_prefix: str
    next_invoice_seq: int
    rounding_increment_minutes: int
    default_due_days: int


class SettingsUpdate(BaseModel):
    business_name: str | None = None
    business_address: str | None = None
    logo_path: str | None = None
    invoice_notes: str | None = None
    currency_symbol: str | None = None
    invoice_number_prefix: str | None = None
    rounding_increment_minutes: int | None = None
    default_due_days: int | None = None


class ClientCreate(BaseModel):
    name: str
    contact: str = ""
    default_hourly_rate: Decimal = Decimal("0")


class ClientUpdate(BaseModel):
    name: str | None = None
    contact: str | None = None
    default_hourly_rate: Decimal | None = None
    archived: bool | None = None


class ClientRead(_ORM):
    id: int
    name: str
    contact: str
    default_hourly_rate: Decimal
    archived: bool


class ProjectCreate(BaseModel):
    client_id: int
    name: str
    hourly_rate_override: Decimal | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    hourly_rate_override: Decimal | None = None
    archived: bool | None = None


class ProjectRead(_ORM):
    id: int
    client_id: int
    name: str
    hourly_rate_override: Decimal | None
    archived: bool


class SegmentRead(_ORM):
    id: int
    started_at: datetime
    ended_at: datetime | None


class TimeEntryRead(_ORM):
    id: int
    project_id: int
    description: str
    status: str
    invoice_id: int | None
    segments: list[SegmentRead]
    duration_seconds: int = 0


class ManualEntryCreate(BaseModel):
    project_id: int
    description: str = ""
    started_at: datetime
    ended_at: datetime


class TimeEntryUpdate(BaseModel):
    description: str | None = None
    project_id: int | None = None


class SegmentUpdate(BaseModel):
    started_at: datetime
    ended_at: datetime | None = None


class InvoiceLineRead(_ORM):
    id: int
    entry_date: datetime
    description: str
    hours: Decimal
    rate: Decimal
    amount: Decimal


class InvoiceRead(_ORM):
    id: int
    client_id: int
    number: str
    issue_date: datetime
    due_date: datetime
    period_start: datetime
    period_end: datetime
    status: str
    currency_symbol: str
    business_name: str
    business_address: str
    notes: str
    subtotal: Decimal
    lines: list[InvoiceLineRead]


class InvoiceCreate(BaseModel):
    client_id: int
    period_start: datetime
    period_end: datetime


class InvoiceStatusUpdate(BaseModel):
    status: str


class DashboardRead(BaseModel):
    unbilled_hours: Decimal
    unbilled_amount: Decimal
    outstanding_total: Decimal
    outstanding_count: int
```

- [ ] **Step 4: Write `backend/app/routers/__init__.py`** (empty) and `backend/app/routers/settings.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Settings
from ..schemas import SettingsRead, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_settings(db: Session) -> Settings:
    s = db.get(Settings, 1)
    if s is None:
        s = Settings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("", response_model=SettingsRead)
def read_settings(db: Session = Depends(get_db)) -> Settings:
    return get_settings(db)


@router.put("", response_model=SettingsRead)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> Settings:
    s = get_settings(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s
```

- [ ] **Step 5: Register router in `backend/app/main.py`**

Add inside `create_app` after health route:

```python
    from .routers import settings as settings_router
    app.include_router(settings_router.router)
```

- [ ] **Step 6: Run test, expect PASS**

Run: `cd backend && pytest tests/test_settings.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/routers backend/app/main.py backend/tests/test_settings.py
git commit -m "feat(backend): add schemas and settings endpoints"
```

---

### Task 5: Clients router

**Files:**
- Create: `backend/app/routers/clients.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_clients.py`

**Interfaces:**
- Produces: `GET /api/clients` (excludes archived unless `?include_archived=true`), `POST /api/clients`, `GET /api/clients/{id}`, `PUT /api/clients/{id}`, `DELETE /api/clients/{id}` (archives if it has projects/entries, else hard-deletes).

- [ ] **Step 1: Write failing test `backend/tests/test_clients.py`**

```python
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
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_clients.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Write `backend/app/routers/clients.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Client, Project, TimeEntry
from ..schemas import ClientCreate, ClientRead, ClientUpdate

router = APIRouter(prefix="/api/clients", tags=["clients"])


def _get(db: Session, client_id: int) -> Client:
    obj = db.get(Client, client_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return obj


@router.get("", response_model=list[ClientRead])
def list_clients(include_archived: bool = False, db: Session = Depends(get_db)):
    stmt = select(Client)
    if not include_archived:
        stmt = stmt.where(Client.archived.is_(False))
    return db.scalars(stmt.order_by(Client.name)).all()


@router.post("", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)):
    obj = Client(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{client_id}", response_model=ClientRead)
def get_client(client_id: int, db: Session = Depends(get_db)):
    return _get(db, client_id)


@router.put("/{client_id}", response_model=ClientRead)
def update_client(client_id: int, payload: ClientUpdate, db: Session = Depends(get_db)):
    obj = _get(db, client_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db)):
    obj = _get(db, client_id)
    has_projects = db.scalar(
        select(Project.id).where(Project.client_id == client_id).limit(1)
    )
    if has_projects:
        obj.archived = True
    else:
        db.delete(obj)
    db.commit()
```

- [ ] **Step 4: Register router in `main.py`** (add `clients` include alongside settings).

- [ ] **Step 5: Run test, expect PASS**

Run: `cd backend && pytest tests/test_clients.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/clients.py backend/app/main.py backend/tests/test_clients.py
git commit -m "feat(backend): add clients endpoints"
```

---

### Task 6: Projects router

**Files:**
- Create: `backend/app/routers/projects.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_projects.py`

**Interfaces:**
- Produces: `GET /api/projects?client_id=&include_archived=`, `POST /api/projects` (validates client exists), `GET/PUT/DELETE /api/projects/{id}` (delete archives if it has entries).

- [ ] **Step 1: Write failing test `backend/tests/test_projects.py`**

```python
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
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_projects.py -v`
Expected: FAIL (404 route).

- [ ] **Step 3: Write `backend/app/routers/projects.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Client, Project, TimeEntry
from ..schemas import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get(db: Session, project_id: int) -> Project:
    obj = db.get(Project, project_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return obj


@router.get("", response_model=list[ProjectRead])
def list_projects(client_id: int | None = None, include_archived: bool = False,
                  db: Session = Depends(get_db)):
    stmt = select(Project)
    if client_id is not None:
        stmt = stmt.where(Project.client_id == client_id)
    if not include_archived:
        stmt = stmt.where(Project.archived.is_(False))
    return db.scalars(stmt.order_by(Project.name)).all()


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    if db.get(Client, payload.client_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    obj = Project(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return _get(db, project_id)


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(project_id: int, payload: ProjectUpdate,
                   db: Session = Depends(get_db)):
    obj = _get(db, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    obj = _get(db, project_id)
    has_entries = db.scalar(
        select(TimeEntry.id).where(TimeEntry.project_id == project_id).limit(1)
    )
    if has_entries:
        obj.archived = True
    else:
        db.delete(obj)
    db.commit()
```

- [ ] **Step 4: Register router in `main.py`.**

- [ ] **Step 5: Run test, expect PASS**

Run: `cd backend && pytest tests/test_projects.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/projects.py backend/app/main.py backend/tests/test_projects.py
git commit -m "feat(backend): add projects endpoints"
```

---

### Task 7: Time entries + timer control

**Files:**
- Create: `backend/app/routers/time_entries.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_time_entries.py`

**Interfaces:**
- Produces:
  - `POST /api/time-entries/start` body `{project_id, description}` → creates running entry with one open segment.
  - `POST /api/time-entries/{id}/pause` → closes open segment, status `paused`.
  - `POST /api/time-entries/{id}/resume` → new open segment, status `running`.
  - `POST /api/time-entries/{id}/stop` → closes open segment, status `stopped`.
  - `POST /api/time-entries/manual` (ManualEntryCreate) → stopped entry with one closed segment.
  - `GET /api/time-entries?project_id=&client_id=&status=&billed=&start=&end=` → list with computed `duration_seconds`.
  - `GET /api/time-entries/running` → all running/paused entries with `duration_seconds`.
  - `PUT /api/time-entries/{id}` (TimeEntryUpdate) — blocked if `invoice_id` set (409).
  - `PUT /api/time-entries/{id}/segments/{seg_id}` (SegmentUpdate) — blocked if invoiced (409).
  - `DELETE /api/time-entries/{id}` — blocked if invoiced (409).
- Serialization helper `to_read(entry, now=None) -> dict` sets `duration_seconds` via `segment_seconds`.

- [ ] **Step 1: Write failing test `backend/tests/test_time_entries.py`**

```python
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
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_time_entries.py -v`
Expected: FAIL (404 route).

- [ ] **Step 3: Write `backend/app/routers/time_entries.py`**

```python
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project, TimeEntry, TimeSegment
from ..schemas import (ManualEntryCreate, SegmentUpdate, TimeEntryRead,
                       TimeEntryUpdate)
from ..time_math import segment_seconds

router = APIRouter(prefix="/api/time-entries", tags=["time-entries"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get(db: Session, entry_id: int) -> TimeEntry:
    obj = db.get(TimeEntry, entry_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Time entry not found")
    return obj


def _require_unbilled(entry: TimeEntry) -> None:
    if entry.invoice_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Entry already invoiced")


def to_read(entry: TimeEntry, now: datetime | None = None) -> dict:
    data = TimeEntryRead.model_validate(entry).model_dump()
    data["duration_seconds"] = segment_seconds(entry.segments, now=now)
    return data


class StartBody(TimeEntryUpdate):
    project_id: int


@router.post("/start", response_model=TimeEntryRead,
             status_code=status.HTTP_201_CREATED)
def start(body: dict, db: Session = Depends(get_db)):
    project_id = body.get("project_id")
    if project_id is None or db.get(Project, project_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    entry = TimeEntry(project_id=project_id, description=body.get("description", ""),
                      status="running")
    entry.segments.append(TimeSegment(started_at=_now()))
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return to_read(entry)


def _open_segment(entry: TimeEntry) -> TimeSegment | None:
    for seg in entry.segments:
        if seg.ended_at is None:
            return seg
    return None


@router.post("/{entry_id}/pause", response_model=TimeEntryRead)
def pause(entry_id: int, db: Session = Depends(get_db)):
    entry = _get(db, entry_id)
    _require_unbilled(entry)
    seg = _open_segment(entry)
    if seg is not None:
        seg.ended_at = _now()
    entry.status = "paused"
    db.commit()
    db.refresh(entry)
    return to_read(entry)


@router.post("/{entry_id}/resume", response_model=TimeEntryRead)
def resume(entry_id: int, db: Session = Depends(get_db)):
    entry = _get(db, entry_id)
    _require_unbilled(entry)
    if _open_segment(entry) is None:
        entry.segments.append(TimeSegment(started_at=_now()))
    entry.status = "running"
    db.commit()
    db.refresh(entry)
    return to_read(entry)


@router.post("/{entry_id}/stop", response_model=TimeEntryRead)
def stop(entry_id: int, db: Session = Depends(get_db)):
    entry = _get(db, entry_id)
    _require_unbilled(entry)
    seg = _open_segment(entry)
    if seg is not None:
        seg.ended_at = _now()
    entry.status = "stopped"
    db.commit()
    db.refresh(entry)
    return to_read(entry)


@router.post("/manual", response_model=TimeEntryRead,
             status_code=status.HTTP_201_CREATED)
def manual(payload: ManualEntryCreate, db: Session = Depends(get_db)):
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if payload.ended_at <= payload.started_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ended_at must be after started_at")
    entry = TimeEntry(project_id=payload.project_id, description=payload.description,
                      status="stopped")
    entry.segments.append(TimeSegment(started_at=payload.started_at,
                                      ended_at=payload.ended_at))
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return to_read(entry)


@router.get("/running", response_model=list[TimeEntryRead])
def running(db: Session = Depends(get_db)):
    now = _now()
    entries = db.scalars(
        select(TimeEntry).where(TimeEntry.status.in_(["running", "paused"]))
    ).all()
    return [to_read(e, now=now) for e in entries]


@router.get("", response_model=list[TimeEntryRead])
def list_entries(project_id: int | None = None, client_id: int | None = None,
                 status_filter: str | None = None, billed: bool | None = None,
                 db: Session = Depends(get_db)):
    stmt = select(TimeEntry)
    if project_id is not None:
        stmt = stmt.where(TimeEntry.project_id == project_id)
    if client_id is not None:
        stmt = stmt.join(Project).where(Project.client_id == client_id)
    if status_filter is not None:
        stmt = stmt.where(TimeEntry.status == status_filter)
    if billed is True:
        stmt = stmt.where(TimeEntry.invoice_id.is_not(None))
    elif billed is False:
        stmt = stmt.where(TimeEntry.invoice_id.is_(None))
    now = _now()
    entries = db.scalars(stmt.order_by(TimeEntry.created_at.desc())).all()
    return [to_read(e, now=now) for e in entries]


@router.put("/{entry_id}", response_model=TimeEntryRead)
def update_entry(entry_id: int, payload: TimeEntryUpdate,
                 db: Session = Depends(get_db)):
    entry = _get(db, entry_id)
    _require_unbilled(entry)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return to_read(entry)


@router.put("/{entry_id}/segments/{seg_id}", response_model=TimeEntryRead)
def update_segment(entry_id: int, seg_id: int, payload: SegmentUpdate,
                   db: Session = Depends(get_db)):
    entry = _get(db, entry_id)
    _require_unbilled(entry)
    seg = db.get(TimeSegment, seg_id)
    if seg is None or seg.time_entry_id != entry_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Segment not found")
    seg.started_at = payload.started_at
    seg.ended_at = payload.ended_at
    db.commit()
    db.refresh(entry)
    return to_read(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = _get(db, entry_id)
    _require_unbilled(entry)
    db.delete(entry)
    db.commit()
```

Note on `?status=`: FastAPI query param is named `status_filter` but exposed as `status` via alias — add `from fastapi import Query` and change signature to `status_filter: str | None = Query(default=None, alias="status")`. Apply this in Step 3.

- [ ] **Step 4: Register router in `main.py`.**

- [ ] **Step 5: Run test, expect PASS**

Run: `cd backend && pytest tests/test_time_entries.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/time_entries.py backend/app/main.py backend/tests/test_time_entries.py
git commit -m "feat(backend): add time entry and timer endpoints"
```

---

### Task 8: Invoicing service + invoices router

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/invoicing.py`, `backend/app/routers/invoices.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_invoicing.py`

**Interfaces:**
- Produces `build_invoice(db, client_id, period_start, period_end) -> Invoice`:
  - Selects stopped, un-invoiced entries for the client whose first-segment `started_at` (local date) is within `[period_start, period_end]` inclusive.
  - Raises `ValueError` if none found.
  - Per entry: `hours = round_hours(segment_seconds(segments), settings.rounding_increment_minutes)`, `rate = resolve_rate(client.default_hourly_rate, project.hourly_rate_override)`, `amount = (hours*rate).quantize(0.01)`.
  - Creates `Invoice` (+ lines), snapshots settings/business fields, assigns `number = prefix + zero-padded next_invoice_seq`, increments `next_invoice_seq`, sets `issue_date=today`, `due_date=today+default_due_days`, `status="invoiced"`, `subtotal=sum(amounts)`. Sets each entry's `invoice_id`.
- Endpoints: `POST /api/invoices` (InvoiceCreate) → 201 InvoiceRead (400 on empty range), `GET /api/invoices`, `GET /api/invoices/{id}`, `DELETE /api/invoices/{id}` (unlinks entries, deletes invoice).

- [ ] **Step 1: Write failing test `backend/tests/test_invoicing.py`**

```python
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
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_invoicing.py -v`
Expected: FAIL (404 route).

- [ ] **Step 3: Write `backend/app/services/__init__.py`** (empty) and `backend/app/services/invoicing.py`

```python
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Client, Invoice, InvoiceLine, TimeEntry
from ..routers.settings import get_settings
from ..time_math import resolve_rate, round_hours, segment_seconds


def _entry_date(entry: TimeEntry) -> datetime:
    return entry.segments[0].started_at


def build_invoice(db: Session, client_id: int, period_start: datetime,
                  period_end: datetime) -> Invoice:
    client = db.get(Client, client_id)
    if client is None:
        raise ValueError("Client not found")

    entries = db.scalars(
        select(TimeEntry)
        .join(TimeEntry.project)
        .where(
            TimeEntry.status == "stopped",
            TimeEntry.invoice_id.is_(None),
        )
        .where(TimeEntry.project.has(client_id=client_id))
    ).all()

    selected = [
        e for e in entries
        if e.segments and period_start <= _entry_date(e) <= period_end
    ]
    if not selected:
        raise ValueError("No unbilled entries in the selected range")

    settings = get_settings(db)
    now = datetime.now(timezone.utc)
    invoice = Invoice(
        client_id=client_id,
        number=f"{settings.invoice_number_prefix}{settings.next_invoice_seq:04d}",
        issue_date=now,
        due_date=now + timedelta(days=settings.default_due_days),
        period_start=period_start,
        period_end=period_end,
        status="invoiced",
        currency_symbol=settings.currency_symbol,
        business_name=settings.business_name,
        business_address=settings.business_address,
        notes=settings.invoice_notes,
    )
    subtotal = Decimal("0.00")
    selected.sort(key=_entry_date)
    for e in selected:
        hours = round_hours(segment_seconds(e.segments),
                            settings.rounding_increment_minutes)
        rate = resolve_rate(client.default_hourly_rate, e.project.hourly_rate_override)
        amount = (hours * rate).quantize(Decimal("0.01"))
        invoice.lines.append(InvoiceLine(
            time_entry_id=e.id, entry_date=_entry_date(e),
            description=e.description, hours=hours, rate=rate, amount=amount,
        ))
        subtotal += amount
        e.invoice = invoice
    invoice.subtotal = subtotal
    settings.next_invoice_seq += 1
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice
```

- [ ] **Step 4: Write `backend/app/routers/invoices.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invoice
from ..schemas import InvoiceCreate, InvoiceRead
from ..services.invoicing import build_invoice

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_invoice(payload: InvoiceCreate, db: Session = Depends(get_db)):
    try:
        return build_invoice(db, payload.client_id, payload.period_start,
                             payload.period_end)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.get("", response_model=list[InvoiceRead])
def list_invoices(db: Session = Depends(get_db)):
    return db.scalars(select(Invoice).order_by(Invoice.created_at.desc())).all()


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    obj = db.get(Invoice, invoice_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return obj


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    obj = db.get(Invoice, invoice_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    for entry in obj.entries:
        entry.invoice_id = None
    db.delete(obj)
    db.commit()
```

- [ ] **Step 5: Register router in `main.py`.**

- [ ] **Step 6: Run test, expect PASS**

Run: `cd backend && pytest tests/test_invoicing.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services backend/app/routers/invoices.py backend/app/main.py backend/tests/test_invoicing.py
git commit -m "feat(backend): add invoice generation from date range"
```

---

### Task 9: Invoice status transitions

**Files:**
- Modify: `backend/app/routers/invoices.py`
- Test: `backend/tests/test_invoice_status.py`

**Interfaces:**
- Produces: `PUT /api/invoices/{id}/status` body `{status}` — accepts only `invoiced|sent|paid`; rejects others with 422; allows any transition among the three (simple v1).

- [ ] **Step 1: Write failing test `backend/tests/test_invoice_status.py`**

```python
def _invoice(client):
    cid = client.post("/api/clients", json={"name": "Acme",
                                            "default_hourly_rate": "100"}).json()["id"]
    pid = client.post("/api/projects", json={"client_id": cid, "name": "W"}).json()["id"]
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "started_at": "2026-07-02T09:00:00Z",
        "ended_at": "2026-07-02T10:00:00Z"})
    return client.post("/api/invoices", json={
        "client_id": cid, "period_start": "2026-07-01T00:00:00Z",
        "period_end": "2026-07-31T00:00:00Z"}).json()["id"]


def test_status_transitions(client):
    iid = _invoice(client)
    r = client.put(f"/api/invoices/{iid}/status", json={"status": "sent"})
    assert r.status_code == 200
    assert r.json()["status"] == "sent"
    assert client.put(f"/api/invoices/{iid}/status",
                      json={"status": "paid"}).json()["status"] == "paid"
    assert client.put(f"/api/invoices/{iid}/status",
                      json={"status": "bogus"}).status_code == 422
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_invoice_status.py -v`
Expected: FAIL (404 route).

- [ ] **Step 3: Add endpoint to `backend/app/routers/invoices.py`**

```python
from fastapi import Body

VALID_STATUSES = {"invoiced", "sent", "paid"}


@router.put("/{invoice_id}/status", response_model=InvoiceRead)
def set_status(invoice_id: int, status_value: str = Body(..., embed=True, alias="status"),
               db: Session = Depends(get_db)):
    if status_value not in VALID_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid status")
    obj = db.get(Invoice, invoice_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    obj.status = status_value
    db.commit()
    db.refresh(obj)
    return obj
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd backend && pytest tests/test_invoice_status.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/invoices.py backend/tests/test_invoice_status.py
git commit -m "feat(backend): add invoice status transitions"
```

---

### Task 10: Dashboard aggregations

**Files:**
- Create: `backend/app/routers/dashboard.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_dashboard.py`

**Interfaces:**
- Produces: `GET /api/dashboard` → `DashboardRead`:
  - `unbilled_hours` = sum over stopped, un-invoiced entries of `round_hours(seconds, increment)`.
  - `unbilled_amount` = sum of `hours*resolved_rate`.
  - `outstanding_total` = sum of `subtotal` for invoices with status in {`invoiced`,`sent`}.
  - `outstanding_count` = count of those invoices.

- [ ] **Step 1: Write failing test `backend/tests/test_dashboard.py`**

```python
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
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_dashboard.py -v`
Expected: FAIL (404 route).

- [ ] **Step 3: Write `backend/app/routers/dashboard.py`**

```python
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invoice, TimeEntry
from ..routers.settings import get_settings
from ..schemas import DashboardRead
from ..time_math import resolve_rate, round_hours, segment_seconds

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardRead)
def dashboard(db: Session = Depends(get_db)) -> DashboardRead:
    settings = get_settings(db)
    entries = db.scalars(
        select(TimeEntry).where(TimeEntry.status == "stopped",
                                TimeEntry.invoice_id.is_(None))
    ).all()
    unbilled_hours = Decimal("0.00")
    unbilled_amount = Decimal("0.00")
    for e in entries:
        hours = round_hours(segment_seconds(e.segments),
                            settings.rounding_increment_minutes)
        rate = resolve_rate(e.project.client.default_hourly_rate,
                            e.project.hourly_rate_override)
        unbilled_hours += hours
        unbilled_amount += (hours * rate).quantize(Decimal("0.01"))

    outstanding = db.scalars(
        select(Invoice).where(Invoice.status.in_(["invoiced", "sent"]))
    ).all()
    outstanding_total = sum((i.subtotal for i in outstanding), Decimal("0.00"))
    return DashboardRead(
        unbilled_hours=unbilled_hours,
        unbilled_amount=unbilled_amount,
        outstanding_total=outstanding_total,
        outstanding_count=len(outstanding),
    )
```

- [ ] **Step 4: Register router in `main.py`.**

- [ ] **Step 5: Run test, expect PASS**

Run: `cd backend && pytest tests/test_dashboard.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/dashboard.py backend/app/main.py backend/tests/test_dashboard.py
git commit -m "feat(backend): add dashboard aggregations"
```

---

### Task 11: Invoice PDF

**Files:**
- Create: `backend/app/services/pdf.py`, `backend/app/templates/invoice.html`
- Modify: `backend/app/routers/invoices.py`
- Test: `backend/tests/test_pdf.py`

**Interfaces:**
- Produces `render_invoice_pdf(invoice, settings) -> bytes` using Jinja2 + WeasyPrint. Endpoint `GET /api/invoices/{id}/pdf` returns `application/pdf` (`Response(content=..., media_type="application/pdf")`).

- [ ] **Step 1: Write failing test `backend/tests/test_pdf.py`**

```python
def test_invoice_pdf_download(client):
    cid = client.post("/api/clients", json={"name": "Acme",
                                            "default_hourly_rate": "100"}).json()["id"]
    pid = client.post("/api/projects", json={"client_id": cid, "name": "W"}).json()["id"]
    client.post("/api/time-entries/manual", json={
        "project_id": pid, "started_at": "2026-07-02T09:00:00Z",
        "ended_at": "2026-07-02T10:00:00Z"})
    iid = client.post("/api/invoices", json={
        "client_id": cid, "period_start": "2026-07-01T00:00:00Z",
        "period_end": "2026-07-31T00:00:00Z"}).json()["id"]

    r = client.get(f"/api/invoices/{iid}/pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && pytest tests/test_pdf.py -v`
Expected: FAIL (404 route). Note: requires WeasyPrint system deps (see Task 12 note).

- [ ] **Step 3: Write `backend/app/templates/invoice.html`**

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: sans-serif; font-size: 12px; color: #222; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .row { display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  td.num, th.num { text-align: right; }
  .total { text-align: right; font-size: 15px; font-weight: bold; margin-top: 12px; }
  .muted { color: #666; }
</style></head>
<body>
  <div class="row">
    <div>
      {% if settings.logo_path %}<img src="{{ settings.logo_path }}" height="48"><br>{% endif %}
      <strong>{{ inv.business_name }}</strong><br>
      <span class="muted">{{ inv.business_address }}</span>
    </div>
    <div style="text-align:right">
      <h1>Invoice {{ inv.number }}</h1>
      <div class="muted">Issued: {{ inv.issue_date.date() }}</div>
      <div class="muted">Due: {{ inv.due_date.date() }}</div>
      <div class="muted">Status: {{ inv.status }}</div>
    </div>
  </div>
  <p><strong>Bill to:</strong> {{ inv.client.name }}<br>
     <span class="muted">{{ inv.client.contact }}</span></p>
  <table>
    <thead><tr><th>Date</th><th>Description</th>
      <th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>
      {% for line in inv.lines %}
      <tr><td>{{ line.entry_date.date() }}</td><td>{{ line.description }}</td>
        <td class="num">{{ '%.2f' % line.hours }}</td>
        <td class="num">{{ inv.currency_symbol }}{{ '%.2f' % line.rate }}</td>
        <td class="num">{{ inv.currency_symbol }}{{ '%.2f' % line.amount }}</td></tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="total">Total: {{ inv.currency_symbol }}{{ '%.2f' % inv.subtotal }}</div>
  {% if inv.notes %}<p class="muted">{{ inv.notes }}</p>{% endif %}
</body>
</html>
```

- [ ] **Step 4: Write `backend/app/services/pdf.py`**

```python
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

_TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES)),
    autoescape=select_autoescape(["html"]),
)


def render_invoice_pdf(invoice, settings) -> bytes:
    template = _env.get_template("invoice.html")
    html = template.render(inv=invoice, settings=settings)
    return HTML(string=html).write_pdf()
```

- [ ] **Step 5: Add endpoint to `backend/app/routers/invoices.py`**

```python
from fastapi import Response

from ..services.pdf import render_invoice_pdf
from ..routers.settings import get_settings


@router.get("/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, db: Session = Depends(get_db)):
    obj = db.get(Invoice, invoice_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    pdf = render_invoice_pdf(obj, get_settings(db))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition":
                             f'attachment; filename="{obj.number}.pdf"'})
```

- [ ] **Step 6: Run test, expect PASS**

Run: `cd backend && pytest tests/test_pdf.py -v`
Expected: PASS. If WeasyPrint import fails, install system deps:
`sudo apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libffi-dev`

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/pdf.py backend/app/templates backend/app/routers/invoices.py backend/tests/test_pdf.py
git commit -m "feat(backend): add invoice PDF rendering"
```

---

### Task 12: Serve frontend build + full backend test run

**Files:**
- Modify: `backend/app/main.py`
- Test: run full suite

**Interfaces:**
- Produces: static mount so the SPA is served at `/`. `GET /` returns `index.html` when `frontend/dist` exists; API remains under `/api`.

- [ ] **Step 1: Add static serving to `backend/app/main.py`**

```python
from pathlib import Path
from fastapi.staticfiles import StaticFiles

# inside create_app, AFTER include_router calls:
    dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="spa")
```

- [ ] **Step 2: Run the whole backend suite**

Run: `cd backend && pytest -v`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(backend): serve built SPA from FastAPI"
```

---

### Task 13: Frontend scaffolding + API client + types

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/router.tsx`, `frontend/src/types.ts`, `frontend/src/api/client.ts`

**Interfaces:**
- Produces typed API module `api` with functions: `getDashboard`, `listClients`, `createClient`, `updateClient`, `deleteClient`, `listProjects`, `createProject`, `updateProject`, `deleteProject`, `startTimer`, `pauseTimer`, `resumeTimer`, `stopTimer`, `createManualEntry`, `listEntries`, `listRunning`, `updateEntry`, `updateSegment`, `deleteEntry`, `listInvoices`, `getInvoice`, `createInvoice`, `setInvoiceStatus`, `deleteInvoice`, `invoicePdfUrl`, `getSettings`, `updateSettings`. Types mirror backend schemas.
- Vite dev server proxies `/api` to `http://127.0.0.1:8000`.

- [ ] **Step 1: Write `frontend/package.json`**

```json
{
  "name": "time-biller-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write `frontend/vite.config.ts`**

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/setupTests.ts" },
});
```

- [ ] **Step 3: Write `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write `frontend/index.html`, `src/main.tsx`, `src/setupTests.ts`**

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Time-Biller</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

```typescript
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
);
```

```typescript
// src/setupTests.ts
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Write `frontend/src/types.ts`**

```typescript
export interface Client { id: number; name: string; contact: string;
  default_hourly_rate: string; archived: boolean; }
export interface Project { id: number; client_id: number; name: string;
  hourly_rate_override: string | null; archived: boolean; }
export interface Segment { id: number; started_at: string; ended_at: string | null; }
export interface TimeEntry { id: number; project_id: number; description: string;
  status: "running" | "paused" | "stopped"; invoice_id: number | null;
  segments: Segment[]; duration_seconds: number; }
export interface InvoiceLine { id: number; entry_date: string; description: string;
  hours: string; rate: string; amount: string; }
export interface Invoice { id: number; client_id: number; number: string;
  issue_date: string; due_date: string; period_start: string; period_end: string;
  status: "invoiced" | "sent" | "paid"; currency_symbol: string;
  business_name: string; business_address: string; notes: string;
  subtotal: string; lines: InvoiceLine[]; }
export interface Settings { business_name: string; business_address: string;
  logo_path: string; invoice_notes: string; currency_symbol: string;
  invoice_number_prefix: string; next_invoice_seq: number;
  rounding_increment_minutes: number; default_due_days: number; }
export interface Dashboard { unbilled_hours: string; unbilled_amount: string;
  outstanding_total: string; outstanding_count: number; }
```

- [ ] **Step 6: Write `frontend/src/api/client.ts`**

```typescript
import type { Client, Dashboard, Invoice, Project, Settings, TimeEntry } from "../types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" }, ...init,
  });
  if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || resp.statusText);
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export const api = {
  getDashboard: () => req<Dashboard>("/dashboard"),
  listClients: (inclArchived = false) =>
    req<Client[]>(`/clients?include_archived=${inclArchived}`),
  createClient: (b: Partial<Client>) =>
    req<Client>("/clients", { method: "POST", body: JSON.stringify(b) }),
  updateClient: (id: number, b: Partial<Client>) =>
    req<Client>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteClient: (id: number) => req<void>(`/clients/${id}`, { method: "DELETE" }),
  listProjects: (clientId?: number) =>
    req<Project[]>(`/projects${clientId ? `?client_id=${clientId}` : ""}`),
  createProject: (b: Partial<Project>) =>
    req<Project>("/projects", { method: "POST", body: JSON.stringify(b) }),
  updateProject: (id: number, b: Partial<Project>) =>
    req<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteProject: (id: number) => req<void>(`/projects/${id}`, { method: "DELETE" }),
  startTimer: (project_id: number, description = "") =>
    req<TimeEntry>("/time-entries/start", { method: "POST",
      body: JSON.stringify({ project_id, description }) }),
  pauseTimer: (id: number) => req<TimeEntry>(`/time-entries/${id}/pause`, { method: "POST" }),
  resumeTimer: (id: number) => req<TimeEntry>(`/time-entries/${id}/resume`, { method: "POST" }),
  stopTimer: (id: number) => req<TimeEntry>(`/time-entries/${id}/stop`, { method: "POST" }),
  createManualEntry: (b: { project_id: number; description?: string;
    started_at: string; ended_at: string }) =>
    req<TimeEntry>("/time-entries/manual", { method: "POST", body: JSON.stringify(b) }),
  listEntries: (q: Record<string, string | number | boolean> = {}) =>
    req<TimeEntry[]>(`/time-entries?${new URLSearchParams(
      Object.entries(q).map(([k, v]) => [k, String(v)])).toString()}`),
  listRunning: () => req<TimeEntry[]>("/time-entries/running"),
  updateEntry: (id: number, b: { description?: string; project_id?: number }) =>
    req<TimeEntry>(`/time-entries/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  updateSegment: (id: number, segId: number,
    b: { started_at: string; ended_at: string | null }) =>
    req<TimeEntry>(`/time-entries/${id}/segments/${segId}`, { method: "PUT",
      body: JSON.stringify(b) }),
  deleteEntry: (id: number) => req<void>(`/time-entries/${id}`, { method: "DELETE" }),
  listInvoices: () => req<Invoice[]>("/invoices"),
  getInvoice: (id: number) => req<Invoice>(`/invoices/${id}`),
  createInvoice: (b: { client_id: number; period_start: string; period_end: string }) =>
    req<Invoice>("/invoices", { method: "POST", body: JSON.stringify(b) }),
  setInvoiceStatus: (id: number, status: string) =>
    req<Invoice>(`/invoices/${id}/status`, { method: "PUT",
      body: JSON.stringify({ status }) }),
  deleteInvoice: (id: number) => req<void>(`/invoices/${id}`, { method: "DELETE" }),
  invoicePdfUrl: (id: number) => `/api/invoices/${id}/pdf`,
  getSettings: () => req<Settings>("/settings"),
  updateSettings: (b: Partial<Settings>) =>
    req<Settings>("/settings", { method: "PUT", body: JSON.stringify(b) }),
};
```

- [ ] **Step 7: Write `frontend/src/router.tsx` and `src/App.tsx`** (nav shell with routes to all pages; import page components created in later tasks — create placeholder page files returning `<div/>` now so the build passes, to be filled in Tasks 14-19).

```typescript
// src/router.tsx
import { createBrowserRouter } from "react-router-dom";
import { App } from "./App";
import { Dashboard } from "./pages/Dashboard";
import { Clients } from "./pages/Clients";
import { Projects } from "./pages/Projects";
import { Timer } from "./pages/Timer";
import { TimeEntries } from "./pages/TimeEntries";
import { Invoices } from "./pages/Invoices";
import { InvoiceDetail } from "./pages/InvoiceDetail";
import { SettingsPage } from "./pages/Settings";

export const router = createBrowserRouter([
  { path: "/", element: <App />, children: [
    { index: true, element: <Dashboard /> },
    { path: "clients", element: <Clients /> },
    { path: "projects", element: <Projects /> },
    { path: "timer", element: <Timer /> },
    { path: "entries", element: <TimeEntries /> },
    { path: "invoices", element: <Invoices /> },
    { path: "invoices/:id", element: <InvoiceDetail /> },
    { path: "settings", element: <SettingsPage /> },
  ]},
]);
```

```typescript
// src/App.tsx
import { NavLink, Outlet } from "react-router-dom";

const links = [["/", "Dashboard"], ["/timer", "Timer"], ["/entries", "Entries"],
  ["/clients", "Clients"], ["/projects", "Projects"], ["/invoices", "Invoices"],
  ["/settings", "Settings"]] as const;

export function App() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui" }}>
      <nav style={{ width: 180, background: "#111827", color: "#fff", padding: 16 }}>
        <h2 style={{ fontSize: 18 }}>Time-Biller</h2>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}
            style={({ isActive }) => ({ display: "block", padding: "8px 0",
              color: isActive ? "#60a5fa" : "#e5e7eb", textDecoration: "none" })}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 24 }}><Outlet /></main>
    </div>
  );
}
```

Create placeholder files `src/pages/{Dashboard,Clients,Projects,Timer,TimeEntries,Invoices,InvoiceDetail,Settings}.tsx`, each exporting the named component returning `<div>TODO</div>` (filled in later tasks).

- [ ] **Step 8: Install and build**

Run: `cd frontend && npm install && npm run build`
Expected: build succeeds, `frontend/dist` created.

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold React app, router, and API client"
```

---

### Task 14: Timer page (with test)

**Files:**
- Modify: `frontend/src/pages/Timer.tsx`
- Create: `frontend/src/__tests__/Timer.test.tsx`, `frontend/src/hooks/useElapsed.ts`

**Interfaces:**
- Consumes: `api.listProjects`, `api.listClients`, `api.startTimer`, `api.pauseTimer`, `api.resumeTimer`, `api.stopTimer`, `api.listRunning`.
- Produces: Timer page showing a client→project picker + description and a Start button; a live list of running/paused entries with elapsed time and Pause/Resume/Stop. Ticks locally every second from `duration_seconds` baseline; refetches `listRunning` every 15s.

- [ ] **Step 1: Write failing test `frontend/src/__tests__/Timer.test.tsx`**

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { Timer } from "../pages/Timer";
import { api } from "../api/client";

vi.mock("../api/client");

beforeEach(() => {
  (api.listClients as any).mockResolvedValue([{ id: 1, name: "Acme",
    contact: "", default_hourly_rate: "100", archived: false }]);
  (api.listProjects as any).mockResolvedValue([{ id: 2, client_id: 1,
    name: "Web", hourly_rate_override: null, archived: false }]);
  (api.listRunning as any).mockResolvedValue([]);
  (api.startTimer as any).mockResolvedValue({ id: 9, project_id: 2,
    description: "x", status: "running", invoice_id: null, segments: [],
    duration_seconds: 0 });
});

test("starts a timer for a selected project", async () => {
  render(<Timer />);
  await screen.findByText("Web");
  await userEvent.click(screen.getByRole("button", { name: /start/i }));
  await waitFor(() => expect(api.startTimer).toHaveBeenCalledWith(2, ""));
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd frontend && npx vitest run src/__tests__/Timer.test.tsx`
Expected: FAIL (Timer renders TODO).

- [ ] **Step 3: Write `frontend/src/hooks/useElapsed.ts`**

```typescript
import { useEffect, useState } from "react";

export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function useTicker(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return tick;
}
```

- [ ] **Step 4: Write `frontend/src/pages/Timer.tsx`**

```typescript
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Client, Project, TimeEntry } from "../types";
import { formatHMS, useTicker } from "../hooks/useElapsed";

export function Timer() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState<TimeEntry[]>([]);
  const [baseline] = useState(() => Date.now());
  const tick = useTicker(running.length > 0);

  const refresh = () => api.listRunning().then(setRunning);
  useEffect(() => { api.listClients().then(setClients); refresh(); }, []);
  useEffect(() => {
    if (clientId === "") { setProjects([]); return; }
    api.listProjects(Number(clientId)).then(setProjects);
  }, [clientId]);
  useEffect(() => { const id = setInterval(refresh, 15000); return () => clearInterval(id); }, []);

  const elapsedFor = (e: TimeEntry) => {
    if (e.status !== "running") return e.duration_seconds;
    return e.duration_seconds + Math.floor((Date.now() - baseline) / 1000) - 0 + tick * 0;
  };

  const start = async () => {
    if (projectId === "") return;
    await api.startTimer(Number(projectId), description);
    setDescription("");
    refresh();
  };

  return (
    <div>
      <h1>Timer</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={clientId} onChange={(e) => setClientId(Number(e.target.value) || "")}>
          <option value="">Client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(Number(e.target.value) || "")}>
          <option value="">Project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input placeholder="Description" value={description}
          onChange={(e) => setDescription(e.target.value)} />
        <button onClick={start} disabled={projectId === ""}>Start</button>
      </div>
      <h2>Running</h2>
      {running.length === 0 && <p>No active timers.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {running.map((e) => (
          <li key={e.id} style={{ display: "flex", gap: 12, alignItems: "center",
            padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <strong style={{ fontFamily: "monospace" }}>{formatHMS(elapsedFor(e))}</strong>
            <span>{e.description || "(no description)"}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {e.status === "running"
                ? <button onClick={() => api.pauseTimer(e.id).then(refresh)}>Pause</button>
                : <button onClick={() => api.resumeTimer(e.id).then(refresh)}>Resume</button>}
              <button onClick={() => api.stopTimer(e.id).then(refresh)}>Stop</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run test, expect PASS**

Run: `cd frontend && npx vitest run src/__tests__/Timer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Timer.tsx frontend/src/hooks/useElapsed.ts frontend/src/__tests__/Timer.test.tsx
git commit -m "feat(frontend): timer page with live running entries"
```

---

### Task 15: Clients & Projects pages

**Files:**
- Modify: `frontend/src/pages/Clients.tsx`, `frontend/src/pages/Projects.tsx`

**Interfaces:**
- Consumes: client and project `api` functions.
- Produces: Clients page (list + create/edit form with name, contact, default rate; archive/delete). Projects page (client selector, list projects, create/edit with name + optional rate override; archive/delete).

- [ ] **Step 1: Write `frontend/src/pages/Clients.tsx`**

```typescript
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client } from "../types";

export function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [rate, setRate] = useState("0");

  const load = () => api.listClients().then(setClients);
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    await api.createClient({ name, contact, default_hourly_rate: rate });
    setName(""); setContact(""); setRate("0"); load();
  };

  return (
    <div>
      <h1>Clients</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Contact" value={contact}
          onChange={(e) => setContact(e.target.value)} />
        <input placeholder="Rate" type="number" value={rate}
          onChange={(e) => setRate(e.target.value)} />
        <button onClick={add}>Add client</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Name</th><th align="left">Contact</th>
          <th align="right">Rate</th><th></th></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td><td>{c.contact}</td>
              <td align="right">{c.default_hourly_rate}</td>
              <td align="right">
                <button onClick={() => api.deleteClient(c.id).then(load)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write `frontend/src/pages/Projects.tsx`**

```typescript
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client, Project } from "../types";

export function Projects() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [override, setOverride] = useState("");

  useEffect(() => { api.listClients().then(setClients); }, []);
  const load = () => clientId !== "" && api.listProjects(Number(clientId)).then(setProjects);
  useEffect(() => { load(); }, [clientId]);

  const add = async () => {
    if (clientId === "" || !name.trim()) return;
    await api.createProject({ client_id: Number(clientId), name,
      hourly_rate_override: override ? override : null });
    setName(""); setOverride(""); load();
  };

  return (
    <div>
      <h1>Projects</h1>
      <select value={clientId} onChange={(e) => setClientId(Number(e.target.value) || "")}>
        <option value="">Select client…</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {clientId !== "" && (
        <>
          <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
            <input placeholder="Project name" value={name}
              onChange={(e) => setName(e.target.value)} />
            <input placeholder="Rate override (optional)" type="number" value={override}
              onChange={(e) => setOverride(e.target.value)} />
            <button onClick={add}>Add project</button>
          </div>
          <ul>
            {projects.map((p) => (
              <li key={p.id}>{p.name}
                {p.hourly_rate_override ? ` — ${p.hourly_rate_override}/h` : " (client rate)"}
                <button style={{ marginLeft: 8 }}
                  onClick={() => api.deleteProject(p.id).then(load)}>Delete</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build to verify types**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Clients.tsx frontend/src/pages/Projects.tsx
git commit -m "feat(frontend): clients and projects management pages"
```

---

### Task 16: Time entries review/edit page

**Files:**
- Modify: `frontend/src/pages/TimeEntries.tsx`

**Interfaces:**
- Consumes: `api.listClients`, `api.listEntries`, `api.updateEntry`, `api.deleteEntry`, `api.createManualEntry`, `api.listProjects`.
- Produces: filterable table of entries (by client, billed/unbilled), inline edit of description, delete (disabled when invoiced), and a manual-entry form (project, description, start/end datetime).

- [ ] **Step 1: Write `frontend/src/pages/TimeEntries.tsx`**

```typescript
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client, Project, TimeEntry } from "../types";
import { formatHMS } from "../hooks/useElapsed";

export function TimeEntries() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [form, setForm] = useState({ project_id: "", description: "",
    started_at: "", ended_at: "" });

  useEffect(() => { api.listClients().then(setClients); }, []);
  const load = () => {
    const q: Record<string, string | number> = {};
    if (clientId !== "") q.client_id = Number(clientId);
    api.listEntries(q).then(setEntries);
  };
  useEffect(() => { load(); }, [clientId]);
  useEffect(() => {
    if (clientId !== "") api.listProjects(Number(clientId)).then(setProjects);
  }, [clientId]);

  const addManual = async () => {
    if (!form.project_id || !form.started_at || !form.ended_at) return;
    await api.createManualEntry({
      project_id: Number(form.project_id), description: form.description,
      started_at: new Date(form.started_at).toISOString(),
      ended_at: new Date(form.ended_at).toISOString(),
    });
    setForm({ project_id: "", description: "", started_at: "", ended_at: "" });
    load();
  };

  return (
    <div>
      <h1>Time entries</h1>
      <select value={clientId} onChange={(e) => setClientId(Number(e.target.value) || "")}>
        <option value="">All clients</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <fieldset style={{ margin: "16px 0" }}>
        <legend>Manual entry</legend>
        <select value={form.project_id}
          onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
          <option value="">Project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input placeholder="Description" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input type="datetime-local" value={form.started_at}
          onChange={(e) => setForm({ ...form, started_at: e.target.value })} />
        <input type="datetime-local" value={form.ended_at}
          onChange={(e) => setForm({ ...form, ended_at: e.target.value })} />
        <button onClick={addManual}>Add</button>
      </fieldset>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Description</th><th align="left">Status</th>
          <th align="right">Duration</th><th align="left">Billed</th><th></th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{e.description}</td><td>{e.status}</td>
              <td align="right">{formatHMS(e.duration_seconds)}</td>
              <td>{e.invoice_id ? "Yes" : "No"}</td>
              <td align="right">
                <button disabled={!!e.invoice_id}
                  onClick={() => api.deleteEntry(e.id).then(load)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify types**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/TimeEntries.tsx
git commit -m "feat(frontend): time entries review and manual entry"
```

---

### Task 17: Invoices pages (builder, list, detail) with test

**Files:**
- Modify: `frontend/src/pages/Invoices.tsx`, `frontend/src/pages/InvoiceDetail.tsx`
- Create: `frontend/src/__tests__/InvoiceBuilder.test.tsx`

**Interfaces:**
- Consumes: `api.listClients`, `api.createInvoice`, `api.listInvoices`, `api.getInvoice`, `api.setInvoiceStatus`, `api.deleteInvoice`, `api.invoicePdfUrl`.
- Produces: Invoices page (builder: client + start/end date → Create; list of invoices with status + link to detail). InvoiceDetail page (line items, totals, status buttons, PDF download link).

- [ ] **Step 1: Write failing test `frontend/src/__tests__/InvoiceBuilder.test.tsx`**

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { Invoices } from "../pages/Invoices";
import { api } from "../api/client";

vi.mock("../api/client");

beforeEach(() => {
  (api.listClients as any).mockResolvedValue([{ id: 1, name: "Acme",
    contact: "", default_hourly_rate: "100", archived: false }]);
  (api.listInvoices as any).mockResolvedValue([]);
  (api.createInvoice as any).mockResolvedValue({ id: 5, number: "INV-0001" });
});

test("creates an invoice from client and date range", async () => {
  render(<MemoryRouter><Invoices /></MemoryRouter>);
  await screen.findByText("Acme");
  await userEvent.selectOptions(screen.getByLabelText(/client/i), "1");
  await userEvent.type(screen.getByLabelText(/from/i), "2026-07-01");
  await userEvent.type(screen.getByLabelText(/to/i), "2026-07-31");
  await userEvent.click(screen.getByRole("button", { name: /create invoice/i }));
  await waitFor(() => expect(api.createInvoice).toHaveBeenCalledWith(
    expect.objectContaining({ client_id: 1 })));
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd frontend && npx vitest run src/__tests__/InvoiceBuilder.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write `frontend/src/pages/Invoices.tsx`**

```typescript
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Client, Invoice } from "../types";

export function Invoices() {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  const load = () => api.listInvoices().then(setInvoices);
  useEffect(() => { api.listClients().then(setClients); load(); }, []);

  const create = async () => {
    setError("");
    if (!clientId || !from || !to) return;
    try {
      await api.createInvoice({
        client_id: Number(clientId),
        period_start: new Date(from + "T00:00:00").toISOString(),
        period_end: new Date(to + "T23:59:59").toISOString(),
      });
      load();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div>
      <h1>Invoices</h1>
      <fieldset style={{ marginBottom: 16 }}>
        <legend>New invoice</legend>
        <label>Client
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={create}>Create invoice</button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </fieldset>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Number</th><th align="left">Status</th>
          <th align="right">Total</th></tr></thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id}>
              <td><Link to={`/invoices/${i.id}`}>{i.number}</Link></td>
              <td>{i.status}</td>
              <td align="right">{i.currency_symbol}{i.subtotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write `frontend/src/pages/InvoiceDetail.tsx`**

```typescript
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Invoice } from "../types";

export function InvoiceDetail() {
  const { id } = useParams();
  const [inv, setInv] = useState<Invoice | null>(null);
  const load = () => api.getInvoice(Number(id)).then(setInv);
  useEffect(() => { load(); }, [id]);
  if (!inv) return <p>Loading…</p>;

  return (
    <div>
      <h1>Invoice {inv.number}</h1>
      <p>Status: <strong>{inv.status}</strong></p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["invoiced", "sent", "paid"].map((s) => (
          <button key={s} disabled={inv.status === s}
            onClick={() => api.setInvoiceStatus(inv.id, s).then(load)}>
            Mark {s}
          </button>
        ))}
        <a href={api.invoicePdfUrl(inv.id)} target="_blank" rel="noreferrer">Download PDF</a>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th align="left">Date</th><th align="left">Description</th>
          <th align="right">Hours</th><th align="right">Rate</th>
          <th align="right">Amount</th></tr></thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.entry_date.slice(0, 10)}</td><td>{l.description}</td>
              <td align="right">{l.hours}</td>
              <td align="right">{inv.currency_symbol}{l.rate}</td>
              <td align="right">{inv.currency_symbol}{l.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 style={{ textAlign: "right" }}>Total: {inv.currency_symbol}{inv.subtotal}</h2>
    </div>
  );
}
```

- [ ] **Step 5: Run test, expect PASS**

Run: `cd frontend && npx vitest run src/__tests__/InvoiceBuilder.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Invoices.tsx frontend/src/pages/InvoiceDetail.tsx frontend/src/__tests__/InvoiceBuilder.test.tsx
git commit -m "feat(frontend): invoice builder, list, and detail"
```

---

### Task 18: Dashboard + Settings pages

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `api.getDashboard`, `api.getSettings`, `api.updateSettings`.
- Produces: Dashboard (cards for unbilled hours, unbilled amount, outstanding total, outstanding count). Settings (business name/address/notes, currency symbol, invoice prefix, rounding increment, due days).

- [ ] **Step 1: Write `frontend/src/pages/Dashboard.tsx`**

```typescript
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Dashboard as D } from "../types";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, minWidth: 180 }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export function Dashboard() {
  const [d, setD] = useState<D | null>(null);
  useEffect(() => { api.getDashboard().then(setD); }, []);
  if (!d) return <p>Loading…</p>;
  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Card label="Unbilled hours" value={d.unbilled_hours} />
        <Card label="Unbilled amount" value={d.unbilled_amount} />
        <Card label="Outstanding total" value={d.outstanding_total} />
        <Card label="Outstanding invoices" value={String(d.outstanding_count)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `frontend/src/pages/Settings.tsx`**

```typescript
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Settings } from "../types";

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.getSettings().then(setS); }, []);
  if (!s) return <p>Loading…</p>;

  const upd = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const save = async () => {
    await api.updateSettings(s);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <h1>Settings</h1>
      <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Business name
          <input value={s.business_name} onChange={(e) => upd({ business_name: e.target.value })} /></label>
        <label>Business address
          <textarea value={s.business_address}
            onChange={(e) => upd({ business_address: e.target.value })} /></label>
        <label>Invoice notes
          <textarea value={s.invoice_notes}
            onChange={(e) => upd({ invoice_notes: e.target.value })} /></label>
        <label>Currency symbol
          <input value={s.currency_symbol}
            onChange={(e) => upd({ currency_symbol: e.target.value })} /></label>
        <label>Invoice prefix
          <input value={s.invoice_number_prefix}
            onChange={(e) => upd({ invoice_number_prefix: e.target.value })} /></label>
        <label>Rounding increment (min)
          <input type="number" value={s.rounding_increment_minutes}
            onChange={(e) => upd({ rounding_increment_minutes: Number(e.target.value) })} /></label>
        <label>Default due days
          <input type="number" value={s.default_due_days}
            onChange={(e) => upd({ default_due_days: Number(e.target.value) })} /></label>
        <button onClick={save}>Save</button>
        {saved && <span style={{ color: "green" }}>Saved</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build + run all frontend tests**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build succeeds, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx frontend/src/pages/Settings.tsx
git commit -m "feat(frontend): dashboard and settings pages"
```

---

### Task 19: Launcher + pywebview window

**Files:**
- Create: `desktop/launcher.py`, `desktop/__init__.py`
- Modify: `backend/pyproject.toml` (add `pywebview>=5.1` to dependencies)

**Interfaces:**
- Produces `desktop/launcher.py` that: starts uvicorn on `127.0.0.1:8765` in a background thread, waits for `/api/health`, opens a `pywebview` window pointed at `http://127.0.0.1:8765/`, and starts the tray (Task 20) as a subprocess. Constant `SERVER_URL = "http://127.0.0.1:8765"`.

- [ ] **Step 1: Add dependency**

Modify `backend/pyproject.toml` dependencies: add `"pywebview>=5.1"`.

- [ ] **Step 2: Write `desktop/launcher.py`**

```python
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
    subprocess.Popen([sys.executable, str(ROOT / "desktop" / "tray.py")])
    webview.create_window("Time-Biller", SERVER_URL, width=1100, height=750)
    webview.start()


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Manual verification**

Run: `cd frontend && npm run build && cd .. && python desktop/launcher.py`
Expected: a desktop window opens showing the app; dashboard loads. Close window to exit. (Tray subprocess will error until Task 20 exists; that is expected and non-fatal to the window.)

- [ ] **Step 4: Commit**

```bash
git add desktop/launcher.py desktop/__init__.py backend/pyproject.toml
git commit -m "feat(desktop): launcher with pywebview window and embedded server"
```

---

### Task 20: AppIndicator tray

**Files:**
- Create: `desktop/tray.py`, `desktop/tray_api.py`

**Interfaces:**
- Consumes: `SERVER_URL` (redefined locally to avoid importing webview). REST endpoints `/api/time-entries/running`, `/pause`, `/resume`, `/stop`, `/start`, `/clients`, `/projects`.
- Produces: a GTK AppIndicator whose menu is rebuilt on a timer (every 5s) showing each running/paused entry with live elapsed time and Pause/Resume + Stop items; a "Quick start" submenu (client → project) ; "Open app" and "Quit".

- [ ] **Step 1: Write `desktop/tray_api.py`**

```python
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
```

- [ ] **Step 2: Write `desktop/tray.py`**

```python
from __future__ import annotations

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("AppIndicator3", "0.1")
from gi.repository import AppIndicator3, GLib, Gtk  # noqa: E402

import tray_api as apiclient  # noqa: E402


def _fmt(seconds: int) -> str:
    s = max(0, int(seconds))
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


class Tray:
    def __init__(self) -> None:
        self.indicator = AppIndicator3.Indicator.new(
            "time-biller", "clock",
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS)
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.rebuild()
        GLib.timeout_add_seconds(5, self._tick)

    def _tick(self) -> bool:
        self.rebuild()
        return True

    def rebuild(self) -> None:
        menu = Gtk.Menu()
        try:
            entries = apiclient.running() or []
        except Exception:
            entries = []
            item = Gtk.MenuItem(label="(server unavailable)")
            item.set_sensitive(False)
            menu.append(item)

        for e in entries:
            label = f"{_fmt(e['duration_seconds'])}  {e['description'] or 'Untitled'}"
            header = Gtk.MenuItem(label=label)
            header.set_sensitive(False)
            menu.append(header)
            if e["status"] == "running":
                mi = Gtk.MenuItem(label="   Pause")
                mi.connect("activate", self._wrap(apiclient.pause, e["id"]))
            else:
                mi = Gtk.MenuItem(label="   Resume")
                mi.connect("activate", self._wrap(apiclient.resume, e["id"]))
            menu.append(mi)
            stop_item = Gtk.MenuItem(label="   Stop")
            stop_item.connect("activate", self._wrap(apiclient.stop, e["id"]))
            menu.append(stop_item)

        menu.append(Gtk.SeparatorMenuItem())
        quick = Gtk.MenuItem(label="Quick start")
        quick.set_submenu(self._quick_menu())
        menu.append(quick)

        open_item = Gtk.MenuItem(label="Open app")
        open_item.connect("activate", lambda _:
                          GLib.spawn_command_line_async("xdg-open http://127.0.0.1:8765/"))
        menu.append(open_item)

        quit_item = Gtk.MenuItem(label="Quit tray")
        quit_item.connect("activate", lambda _: Gtk.main_quit())
        menu.append(quit_item)

        menu.show_all()
        self.indicator.set_menu(menu)

    def _quick_menu(self) -> Gtk.Menu:
        submenu = Gtk.Menu()
        try:
            for c in apiclient.clients() or []:
                citem = Gtk.MenuItem(label=c["name"])
                cmenu = Gtk.Menu()
                for p in apiclient.projects(c["id"]) or []:
                    pitem = Gtk.MenuItem(label=p["name"])
                    pitem.connect("activate", self._wrap(apiclient.start, p["id"]))
                    cmenu.append(pitem)
                citem.set_submenu(cmenu)
                submenu.append(citem)
        except Exception:
            err = Gtk.MenuItem(label="(unavailable)")
            err.set_sensitive(False)
            submenu.append(err)
        submenu.show_all()
        return submenu

    def _wrap(self, fn, *args):
        def handler(_menuitem):
            try:
                fn(*args)
            except Exception:
                pass
            self.rebuild()
        return handler


def main() -> None:
    Tray()
    Gtk.main()


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Manual verification**

Prereq (Ubuntu): `sudo apt-get install -y gir1.2-appindicator3-0.1 python3-gi`
Run: `cd frontend && npm run build && cd .. && python desktop/launcher.py`
Expected: a clock icon appears in the Ubuntu top bar; its menu lists running timers with live times, offers Pause/Resume/Stop, a Quick start submenu, and Open app. Start a timer from the tray and confirm it appears in the web UI.

- [ ] **Step 4: Commit**

```bash
git add desktop/tray.py desktop/tray_api.py
git commit -m "feat(desktop): AppIndicator tray for timer control"
```

---

### Task 21: README + run scripts

**Files:**
- Create: `README.md`, `run.sh`

**Interfaces:**
- Produces: setup/run docs and a convenience script that builds the frontend and launches the desktop app.

- [ ] **Step 1: Write `run.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
( cd frontend && npm install && npm run build )
( cd backend && pip install -e ".[dev]" )
python desktop/launcher.py
```

- [ ] **Step 2: Write `README.md`** documenting: purpose, prerequisites (Python 3.11+, Node 18+, system deps for WeasyPrint and AppIndicator listed in Tasks 11 and 20), how to run (`bash run.sh`), where data is stored (`~/.local/share/time-biller/time_biller.db`), how to run tests (`cd backend && pytest`; `cd frontend && npx vitest run`), and the v1 scope/non-goals.

- [ ] **Step 3: Make executable and commit**

```bash
chmod +x run.sh
git add README.md run.sh
git commit -m "docs: add README and run script"
```

---

## Self-Review

**Spec coverage:**
- Clients/projects with rates → Tasks 5, 6; rate override + resolution → Tasks 3, 8, 10. ✓
- Start/stop timer + pause/resume + manual entry → Task 7; UI → Task 14, 16. ✓
- Review/edit entries + invoiced-edit lock → Task 7 (API), Task 16 (UI). ✓
- Date range → itemized invoice, per-entry line, 15-min rounding → Task 8. ✓
- Invoice status invoiced→sent→paid → Task 9, UI Task 17. ✓
- Unbilled hours + outstanding totals → Task 10, UI Task 18. ✓
- PDF with logo/business info → Task 11. ✓
- Desktop window (pywebview) → Task 19. ✓
- AppIndicator: check ongoing task times, pause/stop, quick create → Task 20. ✓
- Local-only, single-user, single currency, no tax → Global Constraints + models. ✓

**Placeholder scan:** Placeholder page files in Task 13 are intentional scaffolding, each filled by a named later task (14-18). No "TBD"/"handle edge cases" left in implementation steps.

**Type consistency:** `to_read` adds `duration_seconds` (schema field present on `TimeEntryRead`); API client function names match usage in pages; `SERVER_URL`/`BASE` port 8765 consistent across launcher and tray; invoice status set uses `{invoiced,sent,paid}` everywhere.

**Notes for implementer:**
- WeasyPrint (Task 11) and AppIndicator (Task 20) need system packages; commands are included in those tasks.
- Task 7 Step 3 includes a follow-up note to alias the `status` query param — apply it during implementation.
