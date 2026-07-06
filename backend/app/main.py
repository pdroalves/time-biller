from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401
from .db import Base, engine


def create_app() -> FastAPI:
    app = FastAPI(title="Time-Biller")
    Base.metadata.create_all(bind=engine)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    from .routers import settings as settings_router
    app.include_router(settings_router.router)

    from .routers import clients as clients_router
    app.include_router(clients_router.router)

    from .routers import projects as projects_router
    app.include_router(projects_router.router)

    from .routers import time_entries as time_entries_router
    app.include_router(time_entries_router.router)

    from .routers import invoices as invoices_router
    app.include_router(invoices_router.router)

    from .routers import dashboard as dashboard_router
    app.include_router(dashboard_router.router)

    dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="spa")

    return app


app = create_app()
