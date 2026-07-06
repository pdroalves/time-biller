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
