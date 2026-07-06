from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    if now is None:
        now = _now()
    data = TimeEntryRead.model_validate(entry).model_dump()
    data["duration_seconds"] = segment_seconds(entry.segments, now=now)
    return data


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
                 status_filter: str | None = Query(default=None, alias="status"),
                 billed: bool | None = None,
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
