"""Methodology registry API (PBI-055).

CRUD over the YAML store (PBI-054): list, create, read, full update,
set-default. Bodies validate against the Methodology schema — FastAPI
returns 422 naming the field automatically. Path/body id mismatch
422s; duplicate create 409s (never silently overwrite a pipeline);
unknown ids 404.
"""
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError
from app.graph.registry import CONDITION_REGISTRY
from app.models.methodology import Methodology
from app.store.methodology import MethodologyStore

router = APIRouter()
# Module-global (the committed registry). Tests monkeypatch this attr
# to a tmp dir — mutating the real YAMLs in tests is never acceptable.
store = MethodologyStore()


def _check_names(m: Methodology):
    """Registry validation at save time (compile re-checks at use):
    unknown names 422 naming methodology + stage + field. Judge overlap
    enforced when a judge is set; empty judge means unconfigured (same
    rule as the settings API). Mirrors compile.py validation (custom
    roles, all four branch forms) — the two must stay in sync."""
    from app.graph.custom_nodes import get_full_node_registry
    from app.graph.expr_condition import make_expr_condition
    ids = {s.id for s in m.workflow.stages}
    node_registry = get_full_node_registry()
    custom_ids = {r.id for r in m.custom_roles}

    def _fail(stage_id, field, value):
        raise HTTPException(
            status_code=422,
            detail=f"methodology {m.id} stage {stage_id}: "
                   f"unknown {field} '{value}'")

    for stage in m.workflow.stages:
        if stage.node not in node_registry and stage.node not in custom_ids:
            _fail(stage.id, "node", stage.node)
        branch_forms = [f for f in (stage.loop_while,
                                    stage.loop_condition,
                                    stage.loop_always,
                                    stage.route)
                        if f is not None]
        if len(branch_forms) > 1:
            raise HTTPException(
                status_code=422,
                detail=f"methodology {m.id} stage {stage.id}: "
                       "loop_while, loop_condition, loop_always and "
                       "route are mutually exclusive")
        if stage.loop_while is not None:
            if stage.loop_while not in CONDITION_REGISTRY:
                _fail(stage.id, "loop_while", stage.loop_while)
            if stage.loop_target not in ids:
                _fail(stage.id, "loop_target", stage.loop_target)
        if stage.loop_condition is not None:
            if stage.loop_target not in ids:
                _fail(stage.id, "loop_target", stage.loop_target)
            try:
                make_expr_condition(stage.loop_condition)
            except ValueError as exc:
                raise HTTPException(status_code=422,
                                    detail=f"methodology {m.id} "
                                           f"stage {stage.id}: {exc}")
        if stage.loop_always is not None and \
                stage.loop_always not in ids:
            _fail(stage.id, "loop_always", stage.loop_always)
        if stage.route is not None and \
                stage.route not in CONDITION_REGISTRY:
            _fail(stage.id, "route", stage.route)
    if m.models.get("judge"):
        from app.agents.config import validate_model_assignment
        try:
            validate_model_assignment(
                {k: v for k, v in m.models.items() if k != "judge"},
                m.models["judge"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))


@router.get("/methodologies")
def list_methodologies():
    """Saved methodologies (the captured research/brainstorm/academic
    pipelines ship as the first three)."""
    return [m.model_dump(mode="json") for m in store.list()]


@router.post("/methodologies", status_code=201)
def create_methodology(payload: dict):
    """Save a new methodology. Unknown node/condition names and 5b-keys
    fail schema validation (422) — same gate as the compiler."""
    try:
        m = Methodology(**(payload or {}))
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    _check_names(m)
    try:
        store.get(m.id)
        raise HTTPException(status_code=409,
                            detail=f"methodology {m.id} already exists")
    except KeyError:
        pass
    store.save(m)
    return m.model_dump(mode="json")


@router.get("/methodologies/{id}")
def get_methodology(id: str):
    try:
        return store.get(id).model_dump(mode="json")
    except KeyError:
        raise HTTPException(status_code=404,
                            detail=f"unknown methodology: {id}")


@router.put("/methodologies/{id}")
def update_methodology(id: str, payload: dict):
    """Full update — same body/validation as POST."""
    try:
        m = Methodology(**(payload or {}))
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if m.id != id:
        raise HTTPException(status_code=422,
                            detail="body id must match path id")
    _check_names(m)
    try:
        store.get(id)
    except KeyError:
        raise HTTPException(status_code=404,
                            detail=f"unknown methodology: {id}")
    store.save(m)
    return m.model_dump(mode="json")


@router.post("/methodologies/{id}/set-default")
def set_default(id: str):
    """Mark default (unsets holders sharing any mode)."""
    try:
        store.set_default(id)
    except KeyError:
        raise HTTPException(status_code=404,
                            detail=f"unknown methodology: {id}")
    return {"default": id}
