"""App entrypoint. Routers land here (PBI-014/015); nothing else imports it."""

from pathlib import Path
from fastapi import FastAPI
from app import config
from app.api import lab_projects, runs


def create_app(lab_root=None) -> FastAPI:
    app = FastAPI(title="Evidence Research OS")
    app.state.lab_root = Path(lab_root) if lab_root is not None else config.LAB_PROJECTS_ROOT
    app.include_router(lab_projects.router, prefix="/api/v1/lab-projects")
    app.include_router(runs.router, prefix="/api/v1/lab-projects")
    return app


app = create_app()
