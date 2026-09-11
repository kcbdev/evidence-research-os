"""Lab Project CRUD (spec §8). Budgets/models live in project.yaml;
runs live in runs.py."""
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from app.agents.config import validate_model_assignment
from app.models.evidence import ProjectMeta
from app.store.lab_project import LabProjectStore

router = APIRouter()

AUTO_MODEL = "openrouter/auto"


def _root(request: Request) -> Path:
    return Path(request.app.state.lab_root)


def _store(root: Path, project_id: str) -> LabProjectStore:
    # Existence BEFORE construction: LabProjectStore.__init__ creates
    # layout + git repo as a side effect, so a blind construct-then-check
    # would mkdir+git-init on every 404 probe (GET-with-write).
    if not (Path(root) / project_id / "project.yaml").exists():
        raise HTTPException(status_code=404, detail="lab project not found")
    return LabProjectStore(root, project_id)


def _slug(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "lab"
    return f"{slug}-{uuid.uuid4().hex[:6]}"


@router.post("")
def create_lab_project(payload: dict, request: Request):
    """Create a project. Body: {title, question, mode?,
    council_models?, judge_model?, methodology_id?, budget_overrides?
    {max_model_calls, max_research_rounds}}. Returns the stored
    ProjectMeta. Default models are fail-closed (judge==council refuses
    runs). Unknown methodology_id 404s (fail-closed reference)."""
    if not payload.get("title") or not payload.get("question"):
        raise HTTPException(status_code=422,
                            detail="title and question are required")
    # Fail-closed model defaults: judge == council ("openrouter/auto"
    # everywhere) trips the PBI-008 exclusion check, so a project
    # REFUSES to run until real models are configured (creation payload
    # or run payload overrides). No fake runnable defaults. PBI-050:
    # ideator joins the defaults so brainstorm projects configure like
    # the rest (still auto/auto → still refuses until set).
    council = payload.get("council_models", {
        "scientist": AUTO_MODEL, "investigator": AUTO_MODEL,
        "skeptic": AUTO_MODEL, "ideator": AUTO_MODEL})
    judge = payload.get("judge_model", AUTO_MODEL)
    project_id = _slug(payload["title"])
    store = LabProjectStore(_root(request), project_id)
    from app.models.evidence import BudgetState
    budget = BudgetState()
    for key in ("max_model_calls", "max_research_rounds"):
        if key in (payload.get("budget_overrides") or {}):
            value = payload["budget_overrides"][key]
            if not isinstance(value, int) or value <= 0:
                raise HTTPException(
                    status_code=422,
                    detail=f"budget_overrides.{key} must be a positive int")
            setattr(budget, key, value)
    methodology_id = payload.get("methodology_id") or None
    if methodology_id is not None:
        from app.store.methodology import MethodologyStore
        try:
            MethodologyStore().get(methodology_id)
        except KeyError:
            raise HTTPException(
                status_code=404,
                detail=f"unknown methodology: {methodology_id}")
    meta = ProjectMeta(
        id=project_id, title=payload["title"],
        mode=payload.get("mode", "research"), question=payload["question"],
        created_at=datetime.now(timezone.utc),
        council_models=council, judge_model=judge, budget=budget,
        methodology_id=methodology_id)
    store.write_meta(meta)
    return meta.model_dump(mode="json")


@router.get("")
def list_lab_projects(request: Request, include_archived: bool = False):
    """Dashboard list. Returns [{id, title, mode, question,
    claims_count}] — summaries only, no object payloads. Archived
    projects are excluded unless include_archived=true."""
    root = _root(request)
    out = []
    if root.is_dir():
        for child in sorted(root.iterdir()):
            if child.is_dir() and (child / "project.yaml").exists():
                store = LabProjectStore(root, child.name)
                meta = store.read_meta()
                if meta.archived and not include_archived:
                    continue
                out.append({
                    "id": meta.id, "title": meta.title, "mode": meta.mode,
                    "question": meta.question, "archived": meta.archived,
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


@router.patch("/{project_id}")
def update_lab_project(project_id: str, payload: dict, request: Request):
    """Update model assignment ONLY (PBI-028): {council_models?,
    judge_model?}. Per-key MERGE over stored values (batch-review fix:
    pre-PBI-050 projects carry 3-key councils — wholesale replace
    would force them to invent an ideator to save anything). Blank
    ideator where none is stored reads as absent (grandfathered);
    blank anywhere else 400s. Validated (judge overlap refused with a
    readable 400), committed via the store. Everything else in
    project.yaml is untouched — budgets stay run-scoped."""
    store = _store(_root(request), project_id)
    meta = store.read_meta()
    merged = dict(meta.council_models)
    for role, model in (payload.get("council_models") or {}).items():
        merged[role] = model
    if not str(merged.get("ideator", "")).strip() \
            and "ideator" not in meta.council_models:
        merged.pop("ideator", None)  # grandfathered: never required it
    council = merged
    judge = payload.get("judge_model", meta.judge_model)
    try:
        validate_model_assignment(council, judge)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    blanks = [role for role, model in council.items()
              if not str(model).strip()] + ([] if str(judge).strip() else ["judge"])
    if blanks:
        raise HTTPException(
            status_code=400,
            detail=f"Blank model IDs refused for: {', '.join(blanks)} — "
                   "runs cannot start without real OpenRouter model IDs.")
    meta.council_models = council
    meta.judge_model = judge
    store.write_meta(meta)
    return meta.model_dump(mode="json")


@router.delete("/{project_id}")
def archive_lab_project(project_id: str, request: Request):
    """Archive (PBI-020, spec §8): sets the reversible archived flag —
    never hard-deletes. Archived projects leave listings but stay
    fully served by detail. Repeat DELETE is idempotent."""
    store = _store(_root(request), project_id)
    meta = store.read_meta()
    if not meta.archived:
        meta.archived = True
        store.write_meta(meta)
    return {"id": project_id, "archived": True}
