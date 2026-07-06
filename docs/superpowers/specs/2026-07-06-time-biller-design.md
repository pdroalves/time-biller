# Time-Biller — Design Spec

**Date:** 2026-07-06
**Status:** Approved for planning

## 1. Summary

Time-Biller is a lean, **local-only, single-user** time-tracking and invoicing
app for people who bill by the hour (consultants, freelancers, bookkeepers,
small agencies). It runs entirely on the user's Ubuntu machine. The user tracks
time against clients/projects with start/stop/pause timers (or manual entry),
reviews and edits entries, turns a date range of tracked hours into an itemized
PDF invoice, and tracks invoice status. An Ubuntu AppIndicator (system tray) lets
the user monitor and control ongoing timers without opening the main window.

### Non-goals (explicitly out of scope for v1)

- Payment processing / online payments
- Recurring or scheduled invoices
- Multi-user accounts, roles, or authentication
- Real remote/mobile access (no cloud, no LAN server for phones)
- Multiple currencies
- Tax/VAT/GST calculation
- Native mobile app

## 2. Users & context

- **Single user**, running on one Ubuntu desktop. No login/accounts.
- Data lives locally in a single SQLite database file. No network exposure.
- Primary surfaces: a **desktop app window** (React UI) and the **AppIndicator
  tray**. The web UI is kept responsive as a nicety but mobile is not a target.

## 3. Architecture

A single local **FastAPI** process is the source of truth. It:

- Owns all state in **SQLite** (via SQLAlchemy).
- Exposes a REST/JSON API.
- Serves the built React static assets.

Two clients consume that API so state stays consistent:

1. **React/TypeScript web UI** shown in a lightweight **`pywebview`** window.
2. **GTK AppIndicator tray** (PyGObject).

A **launcher** script starts the FastAPI server, opens the `pywebview` window, and
spawns the tray process.

```
+-------------------- Ubuntu desktop --------------------+
|                                                        |
|  launcher                                              |
|    ├── FastAPI server  ──►  SQLite (time_biller.db)    |
|    │        ▲     ▲                                    |
|    │        │     │  (REST/JSON)                       |
|    ├── pywebview window (React UI)                     |
|    └── AppIndicator tray (PyGObject)                   |
+--------------------------------------------------------+
```

### Rationale for `pywebview`

Gives an app-like native window without the weight of Electron/Tauri or a second
toolchain, stays pure-Python, and pairs cleanly with the GTK tray.

## 4. Components

Each component has one clear responsibility.

### 4.1 Backend (`backend/`)

FastAPI app organized by domain module. Each exposes CRUD/API endpoints and
encapsulates its own logic:

- **clients** — client records (name, contact info, default hourly rate).
- **projects** — projects under a client (name, optional rate override).
- **time_entries** — entries and their **segments** (start/stop/pause math).
- **invoices** — invoice creation from a date range, line items, status.
- **settings** — business profile (name, logo, address, invoice notes),
  currency symbol, invoice-number prefix, rounding increment.
- **dashboard** — read-only aggregations (unbilled hours, outstanding totals).
- **pdf** — renders an invoice to a branded PDF on demand.

Persistence: SQLAlchemy models + a lightweight migration approach (see §8).

### 4.2 Frontend (`frontend/`)

React/TypeScript SPA. Screens:

- **Dashboard** — unbilled hours and outstanding invoice totals at a glance.
- **Clients & Projects** — manage clients, their projects, and rates.
- **Timer** — start/pause/resume/stop timers; shows currently running entries
  with live elapsed time; supports multiple concurrent timers.
- **Time entries** — review, filter, edit, and manually add/delete entries.
- **Invoices** — invoice builder (client + date range → preview → create),
  invoice list, invoice detail, status changes, PDF download.
- **Settings** — business profile, logo upload, currency symbol, invoice prefix,
  rounding increment.

### 4.3 Tray (`tray/`)

PyGObject AppIndicator. Menu reflects live state from the API:

- Lists each **running** timer with client/project and live elapsed time.
- Per running timer: **Pause/Resume** and **Stop**.
- **Quick start**: choose client → project (+ optional description) to start a
  new timer.
- **Open app** to focus/show the main window.
- Polls the API on a short interval to refresh elapsed times.

### 4.4 Launcher

Single entry point: boots the FastAPI server (waits until healthy), opens the
`pywebview` window, and spawns the tray process. Handles clean shutdown of all
three.

## 5. Data model

```
Client
  id, name, contact (email/phone/address free-form),
  default_hourly_rate (decimal), created_at, archived (bool)

Project
  id, client_id (FK, required), name,
  hourly_rate_override (decimal, nullable),
  created_at, archived (bool)

TimeEntry
  id, project_id (FK, REQUIRED), description (text),
  status (running | paused | stopped),
  created_at,
  invoice_id (FK, nullable — set once billed)

TimeSegment
  id, time_entry_id (FK), started_at, ended_at (nullable while open)
  # entry duration = sum over segments of (ended_at - started_at)

Invoice
  id, client_id (FK), number (e.g. "INV-0001"),
  issue_date, due_date,
  period_start, period_end,
  status (invoiced | sent | paid),
  currency_symbol (snapshot), business_profile snapshot fields,
  notes, subtotal (== total; no tax), created_at

InvoiceLine
  id, invoice_id (FK), time_entry_id (FK),
  entry_date, description,
  hours (rounded), rate (resolved), amount

Settings (single row)
  business_name, business_address, logo_path, invoice_notes,
  currency_symbol, invoice_number_prefix, next_invoice_seq,
  rounding_increment_minutes (default 15),
  default_due_days (for due_date)
```

**Rate resolution:** an entry's billable rate = its project's
`hourly_rate_override` if set, else the client's `default_hourly_rate`. Resolved
at invoice time and snapshotted onto the `InvoiceLine`.

## 6. Key flows

### 6.1 Tracking time

- **Start:** creates a `TimeEntry` (status `running`) with one open
  `TimeSegment`. Project is required (client is implied by project).
- **Pause:** closes the current open segment; entry status → `paused`.
- **Resume:** opens a new segment; entry status → `running`.
- **Stop:** closes the open segment; entry status → `stopped`.
- **Multiple concurrent timers** are allowed; starting a new one does not affect
  others.
- **Manual entry:** create a `stopped` entry with a single segment from an
  explicit start/end (or a duration), on a chosen project and date.

Stored durations are always exact. **Rounding is never applied to stored data** —
only at invoice time (§6.3).

### 6.2 Review & edit

- List entries with filters (client, project, date range, billed/unbilled).
- Edit description, project, and segment times; add/delete manual entries.
- **Editing or deleting an entry that is already attached to an invoice is
  blocked** (must be done via the invoice). Prevents drift between entries and
  issued invoices.

### 6.3 Invoicing

1. User picks a **client** and a **date range**.
2. Backend gathers that client's **un-invoiced, stopped** entries whose date
   falls in the range. An entry's **date** = the date of its first segment's
   `started_at` (in local time).
3. Each entry's hours are **rounded to the nearest 15 min** (configurable
   increment); rate resolved (§5); `amount = hours * rate`.
4. An `Invoice` is created with **one `InvoiceLine` per time entry**
   (date, description, hours, rate, amount). Subtotal = sum of lines. No tax.
5. Those entries are marked billed (`invoice_id` set) so they leave "unbilled".
6. Invoice number assigned from `prefix + next_invoice_seq`; `issue_date` = today;
   `due_date` = today + `default_due_days`.
7. **PDF** rendered on demand with business name, logo, address, and notes.

**Empty range guard:** creating an invoice with zero matching entries is
rejected with a clear message.

### 6.4 Invoice status

Manual transitions: **Invoiced → Sent → Paid**. "Outstanding" = invoices with
status `invoiced` or `sent`. (Overdue can be derived from `due_date` for display,
but is not a stored status in v1.)

### 6.5 Dashboard

- **Unbilled hours**: sum of stopped, un-invoiced entry durations (optionally
  valued at resolved rates for an unbilled $ figure).
- **Outstanding total**: sum of `invoiced` + `sent` invoice totals.

## 7. Error handling & edge cases

- Client/project required where specified; enforced at the API layer.
- Cannot invoice an empty date range (§6.3).
- Editing/deleting invoiced entries is blocked (§6.2).
- Archiving vs deleting: clients/projects with entries are **archived** (soft),
  not hard-deleted, to preserve invoice history.
- Rounding applies per entry at invoice time, leaving raw data intact.
- Tray and UI both reflect live timer state via the shared API (no divergent
  local state).

## 8. Testing

- **Backend (pytest):** rate resolution, segment duration math, rounding,
  invoice aggregation (one line per entry, subtotal), empty-range guard,
  billed-entry edit lock, status transitions, dashboard aggregations.
- **Frontend:** component/integration tests for the timer (start/pause/resume/
  stop, concurrent timers) and the invoice builder (range → preview → create).
- **Migrations:** schema created/upgraded cleanly on a fresh and existing DB.

## 9. Tech choices (summary)

| Area        | Choice                                   |
|-------------|------------------------------------------|
| Backend     | Python, FastAPI, SQLAlchemy, SQLite      |
| PDF         | Python HTML→PDF (e.g. WeasyPrint)        |
| Frontend    | React + TypeScript (Vite)                |
| Desktop     | `pywebview` window + launcher script     |
| Tray        | PyGObject AppIndicator (GTK)             |
| Tests       | pytest (backend), Vitest/RTL (frontend)  |

Specific library versions are chosen during implementation planning.

## 10. Defaults locked (unless changed later)

- Invoice numbers: sequential with a configurable prefix (`INV-0001`).
- Invoices carry a `due_date` (issue date + `default_due_days`) so "outstanding"
  is meaningful.
- Rounding increment: 15 minutes (configurable in Settings).
