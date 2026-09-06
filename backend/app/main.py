"""App entrypoint. Routers land here (PBI-014/015); nothing else imports it."""

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import config
from app.api import claims, lab_projects, runs


def _allowed_origins() -> list[str]:
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    extra = os.environ.get("FRONTEND_URL")
    if extra and extra not in origins:
        origins.append(extra)  # e.g. the Coolify frontend FQDN (PBI-005)
    return origins


def create_app(lab_root=None) -> FastAPI:
    app = FastAPI(title="Evidence Research OS")
    # PBI-019 witness catch: browsers block localhost:3000 → :8000
    # without this. Env-overridable for deploy; permissive methods/
    # headers are fine — auth does not exist in v1 (single operator).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.lab_root = Path(lab_root) if lab_root is not None else config.LAB_PROJECTS_ROOT
    app.include_router(lab_projects.router, prefix="/api/v1/lab-projects")
    app.include_router(runs.router, prefix="/api/v1/lab-projects")
    # PBI-015 sequences after PBI-014: same file, never parallel.
    app.include_router(claims.router, prefix="/api/v1/lab-projects")
    return app


app = create_app()
