"""Lab Project CRUD (spec §8). Budgets/models live in project.yaml;
runs live in runs.py."""
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from app.models.evidence import ProjectMeta
from app.store.lab_project import LabProjectStore

router = APIRouter()

AUTO_MODEL = "openrouter/auto"


def _root(request: Request) -> Path:
    return Path(request.app.state.lab_root)


def _store(root: Path, project_id: str) -> LabProjectStore:
    store = LabProjectStore(root, project_id)
    if not (store.path / "project.yaml").exists():
        raise HTTPException(status_code=404, detail="lab project not found")
    return store


def _slug(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "lab"
    return f"{slug}-{uuid.uuid4().hex[:6]}"


@router.post("")
def create_lab_project(payload: dict, request: Request):
    """Create a project. Body: {title, question, mode?,
    council_models?, judge_model?}. Returns the stored ProjectMeta.
    Default models are fail-closed (judge==council refuses runs)."""
    if not payload.get("title") or not payload.get("question"):
        raise HTTPException(status_code=422,
                            detail="title and question are required")
    # Fail-closed model defaults: judge == council ("openrouter/auto"
    # everywhere) trips the PBI-008 exclusion check, so a project
    # REFUSES to run until real models are configured (creation payload
    # or run payload overrides). No fake runnable defaults.
    council = payload.get("council_models", {
        "scientist": AUTO_MODEL, "investigator": AUTO_MODEL,
        "skeptic": AUTO_MODEL})
    judge = payload.get("judge_model", AUTO_MODEL)
    project_id = _slug(payload["title"])
    store = LabProjectStore(_root(request), project_id)
    meta = ProjectMeta(
        id=project_id, title=payload["title"],
        mode=payload.get("mode", "research"), question=payload["question"],
        created_at=datetime.now(timezone.utc),
        council_models=council, judge_model=judge)
    store.write_meta(meta)
    return meta.model_dump(mode="json")


@router.get("")
def list_lab_projects(request: Request):
    """Dashboard list. Returns [{id, title, mode, question,
    claims_count}] — summaries only, no object payloads."""
    root = _root(request)
    out = []
    if root.is_dir():
        for child in sorted(root.iterdir()):
            if child.is_dir() and (child / "project.yaml").exists():
                store = LabProjectStore(root, child.name)
                meta = store.read_meta()
                out.append({
                    "id": meta.id, "title": meta.title, "mode": meta.mode,
                    "question": meta.question,
                    "claims_count": len(store.list_claims()),
                })
    return out


@router.get("/{project_id}")
def get_lab_project(project_id: str, request: Request):
    """Project detail. Returns the full ProjectMeta plus per-type
    object counts. (Archive/delete lives in PBI-020, not here.)"""
    store = _store(_root(request), project_id)
    meta = store.read_meta()
    return {**meta.model_dump(mode="json"), "counts": {
        "claims": len(store.list_claims()),
        "evidence": len(store.list_evidence()),
        "sources": len(store.list_sources()),
        "ideas": len(store.list_ideas()),
        "tasks": len(store.list_tasks()),
        "decisions": len(store.list_decisions()),
    }}
