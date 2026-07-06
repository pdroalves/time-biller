from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Invoice
from ..schemas import InvoiceCreate, InvoiceRead
from ..services.invoicing import build_invoice

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_invoice(payload: InvoiceCreate, db: Session = Depends(get_db)):
    try:
        return build_invoice(db, payload.client_id, payload.period_start,
                             payload.period_end)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.get("", response_model=list[InvoiceRead])
def list_invoices(db: Session = Depends(get_db)):
    return db.scalars(select(Invoice).order_by(Invoice.created_at.desc())).all()


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    obj = db.get(Invoice, invoice_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return obj


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    obj = db.get(Invoice, invoice_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    for entry in obj.entries:
        entry.invoice_id = None
    db.delete(obj)
    db.commit()
