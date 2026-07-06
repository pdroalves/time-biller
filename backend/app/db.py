import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DB_PATH = Path.home() / ".local" / "share" / "time-biller" / "time_biller.db"


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    if url is None:
        override = os.environ.get("TIME_BILLER_DB")
        if override:
            url = override if "://" in override else f"sqlite:///{override}"
        else:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            url = f"sqlite:///{DB_PATH}"
    return create_engine(url, connect_args={"check_same_thread": False})


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
