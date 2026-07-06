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
