"""Global settings fallback (PBI-038, API Reference §Settings).

GET/PUT /settings/models (6 roles) + GET/PUT /settings/budget, mounted
at /api/v1 in main.py. PUT validates like run-start: judge overlap with
any council model → 422, auditor inside the council/judge rotation → 422
(both enforced, not conventional). Empty auditor string means
unconfigured — allowed here, degrades at audit time (PBI-039), never a
silent PASS.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from app.agents.config import validate_model_assignment
from app.api.lab_projects import _root
from app.store.settings import (MODEL_ROLES, BudgetDefaults,
                                ModelAssignment, Settings,
                                SettingsStore)

router = APIRouter()


def _store(request: Request) -> SettingsStore:
    return SettingsStore(_root(request))


def _check_assignment(models: ModelAssignment):
    council = {k: v for k, v in models.model_dump().items()
               if k not in ("judge", "auditor") and v}
    judge = models.judge
    if judge:
        try:
            validate_model_assignment(council, judge)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    auditor = models.auditor
    if auditor and (auditor == judge or auditor in council.values()):
        raise HTTPException(
            status_code=422,
            detail="auditor model must stay outside the "
                   "council/judge rotation")


@router.get("/settings/models")
def get_models(request: Request):
    """Current per-role fallback assignment."""
    return _store(request).read().models.model_dump()


@router.put("/settings/models")
def put_models(payload: dict, request: Request):
    """Replace the fallback assignment (full shape, all 6 roles)."""
    if set((payload or {})) != set(MODEL_ROLES):
        raise HTTPException(
            status_code=422,
            detail=f"models must carry exactly: {sorted(MODEL_ROLES)}")
    try:
        models = ModelAssignment(**payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    _check_assignment(models)
    settings = _store(request).read()
    settings.models = models
    _store(request).write(settings)
    return models.model_dump()


@router.get("/settings/budget")
def get_budget(request: Request):
    """Fallback budget defaults for new projects/methodologies."""
    return _store(request).read().budget.model_dump()


@router.put("/settings/budget")
def put_budget(payload: dict, request: Request):
    """Replace the fallback budget defaults (positive ints)."""
    if set((payload or {})) != {"max_model_calls", "max_research_rounds",
                                "max_sources", "max_sources_per_claim"}:
        raise HTTPException(
            status_code=422,
            detail="budget must carry exactly: max_model_calls, "
                   "max_research_rounds, max_sources, "
                   "max_sources_per_claim")
    try:
        budget = BudgetDefaults(**payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    settings = _store(request).read()
    settings.budget = budget
    _store(request).write(settings)
    return budget.model_dump()
