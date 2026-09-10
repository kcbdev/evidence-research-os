"""App entrypoint. Routers land here (PBI-014/015); nothing else imports it."""

import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app import config
from app.api import (audits, claims, graph, ideas, lab_projects, runs,
                   settings)


def _allowed_origins() -> list[str]:
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    extra = os.environ.get("FRONTEND_URL")
    if extra and extra not in origins:
        origins.append(extra)  # e.g. the Coolify frontend FQDN (PBI-005)
    return origins


def create_app(lab_root=None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # PBI-029: revive run records (pre-restart live runs surface as
        # "interrupted"; paused runs stay approvable).
        runs.rehydrate_runs(app.state.lab_root)
        yield

    app = FastAPI(title="Evidence Research OS", lifespan=lifespan)
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
    app.include_router(ideas.router, prefix="/api/v1/lab-projects")
    # PBI-040: audit read model beside the other project routers.
    app.include_router(audits.router, prefix="/api/v1/lab-projects")
    # PBI-045: graph read model, same mount.
    app.include_router(graph.router, prefix="/api/v1/lab-projects")
    # PBI-038: global fallbacks live at /api/v1 (not project-scoped).
    app.include_router(settings.router, prefix="/api/v1")
    return app


app = create_app()
