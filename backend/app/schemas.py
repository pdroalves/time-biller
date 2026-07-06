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
