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
