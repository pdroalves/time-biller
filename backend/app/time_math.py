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
        return (Decimal(seconds) / Decimal(3600)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    increment_seconds = increment_minutes * 60
    units = (Decimal(seconds) / Decimal(increment_seconds)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    rounded_seconds = units * increment_seconds
    return (rounded_seconds / Decimal(3600)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def resolve_rate(client_rate: Decimal, project_override: Decimal | None) -> Decimal:
    return project_override if project_override is not None else client_rate
