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
