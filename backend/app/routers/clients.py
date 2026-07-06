from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Client, Project, TimeEntry
from ..schemas import ClientCreate, ClientRead, ClientUpdate

router = APIRouter(prefix="/api/clients", tags=["clients"])


def _get(db: Session, client_id: int) -> Client:
    obj = db.get(Client, client_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return obj


@router.get("", response_model=list[ClientRead])
def list_clients(include_archived: bool = False, db: Session = Depends(get_db)):
    stmt = select(Client)
    if not include_archived:
        stmt = stmt.where(Client.archived.is_(False))
    return db.scalars(stmt.order_by(Client.name)).all()


@router.post("", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)):
    obj = Client(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{client_id}", response_model=ClientRead)
def get_client(client_id: int, db: Session = Depends(get_db)):
    return _get(db, client_id)


@router.put("/{client_id}", response_model=ClientRead)
def update_client(client_id: int, payload: ClientUpdate, db: Session = Depends(get_db)):
    obj = _get(db, client_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db)):
    obj = _get(db, client_id)
    has_projects = db.scalar(
        select(Project.id).where(Project.client_id == client_id).limit(1)
    )
    if has_projects:
        obj.archived = True
    else:
        db.delete(obj)
    db.commit()
