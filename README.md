# Time-Biller

A lean, local-first time-tracking and invoicing app for people who bill by the
hour — consultants, freelancers, bookkeepers, and small agencies.

Track time with a start/stop timer or manual entry, review and edit your logged
hours, turn a date range into an itemized PDF invoice, and keep an eye on
unbilled hours and outstanding invoice totals from a dashboard. On Ubuntu you
can drive the timer straight from the system tray (AppIndicator).

## Features

- **Clients & projects** — each with its own hourly rate; projects can override
  their client's default rate.
- **Time tracking** — start/stop/pause/resume timer tied to a project, plus
  manual time entry. Review, filter (by client, billed/unbilled), and inline-edit
  entries. Entries lock once invoiced.
- **Invoicing** — turn a date range of a client's unbilled hours into an
  itemized invoice automatically, with time rounded to a configurable increment
  (default 15 min). Download as PDF.
- **Invoice status** — mark invoices `invoiced` → `sent` → `paid`.
- **Dashboard** — unbilled hours, unbilled amount, outstanding total, and count
  of outstanding invoices at a glance.
- **Desktop app** — runs as a native window (pywebview) with an embedded local
  server; no cloud, your data stays on your machine.
- **Ubuntu AppIndicator** — a tray menu that shows each running/paused timer with
  live elapsed time, offers Pause/Resume/Stop, a "Quick start" client → project
  submenu, and "Open app".

## Architecture

- **Backend:** FastAPI + SQLAlchemy 2 + SQLite, Pydantic v2 schemas, WeasyPrint
  for PDF, Jinja2 templates. Serves both the JSON API (`/api/...`) and the built
  frontend.
- **Frontend:** React 18 + TypeScript, built with Vite. Talks to the API via a
  small typed client.
- **Desktop:** `desktop/launcher.py` starts the server and opens a pywebview
  window; `desktop/tray.py` is the GTK AppIndicator, launched as a subprocess.

## Prerequisites

- **Python 3.11+**
- **Node 18+** (for building the frontend)
- **System libraries for WeasyPrint** (PDF rendering). On Debian/Ubuntu:

  ```bash
  sudo apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libcairo2 \
    libgdk-pixbuf-2.0-0 libffi-dev shared-mime-info
  ```

- **System libraries for the AppIndicator tray** (Ubuntu only, optional — needed
  only if you want the system-tray control):

  ```bash
  sudo apt-get install -y gir1.2-appindicator3-0.1 python3-gi
  ```

## Running

The convenience script builds the frontend, installs the backend (editable), and
launches the desktop app:

```bash
bash run.sh
```

A window titled **Time-Biller** opens showing the dashboard. On Ubuntu a clock
icon also appears in the top bar for tray control. Close the window to exit; use
the tray's "Quit tray" item to stop the indicator.

### Running the pieces manually

```bash
# Backend API + built SPA on http://127.0.0.1:8765
cd backend && pip install -e ".[dev]"
uvicorn app.main:app --host 127.0.0.1 --port 8765

# Frontend dev server with hot reload (proxies /api to the backend)
cd frontend && npm install && npm run dev
```

## Data storage

All data lives in a single local SQLite database at:

```
~/.local/share/time-biller/time_biller.db
```

There is no external service and no account. Back up that file to back up your
data. (Tests use a throwaway database via the `TIME_BILLER_DB` env var and never
touch your real data.)

## Tests

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npx vitest run
```

## v1 scope & non-goals

This first version is intentionally lean. **In scope:** the features listed
above, single user, single machine, single currency, no tax handling.
**Explicitly out of scope for v1:** payment processing, recurring invoices,
multi-currency, multi-user/teams, and true mobile apps (the desktop window is the
primary surface, with the tray for quick control).
