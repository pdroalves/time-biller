from fastapi import FastAPI

from .db import Base, engine


def create_app() -> FastAPI:
    app = FastAPI(title="Time-Biller")
    Base.metadata.create_all(bind=engine)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
