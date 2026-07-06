from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Client, Project, TimeEntry
from ..schemas import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get(db: Session, project_id: int) -> Project:
    obj = db.get(Project, project_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return obj


@router.get("", response_model=list[ProjectRead])
def list_projects(client_id: int | None = None, include_archived: bool = False,
                  db: Session = Depends(get_db)):
    stmt = select(Project)
    if client_id is not None:
        stmt = stmt.where(Project.client_id == client_id)
    if not include_archived:
        stmt = stmt.where(Project.archived.is_(False))
    return db.scalars(stmt.order_by(Project.name)).all()


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    if db.get(Client, payload.client_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    obj = Project(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return _get(db, project_id)


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(project_id: int, payload: ProjectUpdate,
                   db: Session = Depends(get_db)):
    obj = _get(db, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    obj = _get(db, project_id)
    has_entries = db.scalar(
        select(TimeEntry.id).where(TimeEntry.project_id == project_id).limit(1)
    )
    if has_entries:
        obj.archived = True
    else:
        db.delete(obj)
    db.commit()
