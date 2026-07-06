from fastapi import FastAPI

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

    return app


app = create_app()
