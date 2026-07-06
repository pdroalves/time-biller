from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Client, Invoice, InvoiceLine, TimeEntry
from ..routers.settings import get_settings
from ..time_math import resolve_rate, round_hours, segment_seconds


def _naive(dt):
    return dt.replace(tzinfo=None) if dt is not None and dt.tzinfo is not None else dt


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
        if e.segments
        and _naive(period_start) <= _naive(_entry_date(e)) <= _naive(period_end)
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
