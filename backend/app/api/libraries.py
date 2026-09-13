"""Builder library API (PBI-063).

CRUD over the YAML library stores: skills, prompts (+version history),
custom roles. Plus three read-only/validation endpoints the canvas
needs: the Tools registry (derived from app.tools.dispatch — the same
names the Tier A compiler resolves, so the UI can never offer a tool
the compiler rejects), condition-fields reference data (derived from
LabProjectState — the fields loop conditions can actually read), and
validate-without-save (the exact save-validation path, minus the
write). Same fail-closed style as the methodology API: schema 422s
name the field, duplicate create 409s, unknown ids 404.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Response
from pydantic import ValidationError
from app.models.libraries import (ConditionField, CustomNodeInfo,
                                  LibraryRole, Prompt, PromptVersion,
                                  Skill, ToolInfo)
from app.store.libraries import LibraryStore

router = APIRouter()
# Module-globals (the committed libraries). Tests monkeypatch these
# attrs to tmp dirs — mutating the real YAMLs in tests is never
# acceptable. Same pattern as methodologies_api.store.
skills = LibraryStore(None, "skills", Skill)
prompts = LibraryStore(None, "prompts", Prompt)
roles = LibraryStore(None, "roles", LibraryRole)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse(model, payload: dict, what: str):
    try:
        return model(**(payload or {}))
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _create(store, entry, what: str):
    try:
        store.get(entry.id)
        raise HTTPException(status_code=409,
                            detail=f"{what} {entry.id} already exists")
    except KeyError:
        pass
    store.save(entry)
    return entry.model_dump(mode="json")


def _read(store, id: str, what: str):
    try:
        return store.get(id)
    except KeyError:
        raise HTTPException(status_code=404,
                            detail=f"unknown {what}: {id}")


def _replace(store, id: str, entry, what: str):
    if entry.id != id:
        raise HTTPException(status_code=422,
                            detail="body id must match path id")
    _read(store, id, what)
    store.save(entry)
    return entry.model_dump(mode="json")


@router.get("/skills")
def list_skills():
    return [s.model_dump(mode="json") for s in skills.list()]


@router.post("/skills", status_code=201)
def create_skill(payload: dict):
    return _create(skills, _parse(Skill, payload, "skill"), "skill")


@router.get("/skills/{id}")
def get_skill(id: str):
    return _read(skills, id, "skill").model_dump(mode="json")


@router.put("/skills/{id}")
def update_skill(id: str, payload: dict):
    return _replace(skills, id, _parse(Skill, payload, "skill"), "skill")


def _versioned_save(body: Prompt, prior: Prompt | None) -> Prompt:
    """Every save freezes the prior text as a version (prompt
    iteration is exactly the change you want to undo). First save is
    version 1 with empty history."""
    history = list(prior.history) if prior is not None else []
    if prior is not None:
        history.append(PromptVersion(version=prior.version,
                                     text=prior.text,
                                     saved_at=prior.updated_at))
    return Prompt(id=body.id, name=body.name,
                  description=body.description, text=body.text,
                  version=(prior.version + 1) if prior is not None else 1,
                  updated_at=_now(), history=history)


@router.get("/prompts")
def list_prompts():
    return [p.model_dump(mode="json") for p in prompts.list()]


@router.post("/prompts")
def create_prompt(payload: dict, response: Response):
    """Create (201), or — if the id exists — save a new version (200).
    One call covers both the library "New" flow and re-saving."""
    body = _parse(Prompt, payload, "prompt")
    try:
        prior = prompts.get(body.id)
    except KeyError:
        fresh = Prompt(id=body.id, name=body.name,
                       description=body.description, text=body.text,
                       version=1, updated_at=_now(), history=[])
        prompts.save(fresh)
        response.status_code = 201
        return fresh.model_dump(mode="json")
    saved = _versioned_save(body, prior)
    prompts.save(saved)
    return saved.model_dump(mode="json")


@router.get("/prompts/{id}")
def get_prompt(id: str):
    return _read(prompts, id, "prompt").model_dump(mode="json")


@router.get("/prompts/{id}/versions")
def prompt_versions(id: str):
    """Full version history, oldest first, current text last — every
    entry revertable by PUTting its text."""
    p = _read(prompts, id, "prompt")
    return [*(v.model_dump(mode="json") for v in p.history),
            PromptVersion(version=p.version, text=p.text,
                          saved_at=p.updated_at).model_dump(mode="json")]


@router.put("/prompts/{id}")
def update_prompt(id: str, payload: dict):
    """Full update — always mints a new version (every save is
    history, per the Prompts editor contract)."""
    body = _parse(Prompt, payload, "prompt")
    if body.id != id:
        raise HTTPException(status_code=422,
                            detail="body id must match path id")
    prior = _read(prompts, id, "prompt")
    saved = _versioned_save(body, prior)
    prompts.save(saved)
    return saved.model_dump(mode="json")


def _check_role_tools(entry: LibraryRole):
    """Unknown tool names 422 naming the tool — the Tier A compiler
    would fail the methodology at build time otherwise; failing at
    library-save time is the earlier, clearer gate."""
    from app.tools.dispatch import TOOLS
    for name in entry.tools:
        if name not in TOOLS:
            raise HTTPException(
                status_code=422,
                detail=f"role {entry.id}: unknown tool '{name}' "
                       f"(available: {', '.join(sorted(TOOLS))})")


@router.get("/roles")
def list_roles():
    return [r.model_dump(mode="json") for r in roles.list()]


@router.post("/roles", status_code=201)
def create_role(payload: dict):
    entry = _parse(LibraryRole, payload, "role")
    _check_role_tools(entry)
    return _create(roles, entry, "role")


@router.get("/roles/{id}")
def get_role(id: str):
    return _read(roles, id, "role").model_dump(mode="json")


@router.put("/roles/{id}")
def update_role(id: str, payload: dict):
    entry = _parse(LibraryRole, payload, "role")
    _check_role_tools(entry)
    return _replace(roles, id, entry, "role")


@router.get("/tools")
def list_tools():
    """Read-only registry: the exact names get_tools_for_names
    resolves (same source, no drift — the UI can only offer what the
    compiler accepts). No POST/PUT/DELETE exists on this path: new
    tools are a backend concern (code, not configuration)."""
    from app.tools.dispatch import TOOLS
    return [ToolInfo(name=name, description=f"{name}{usage}",
                     source="backend-local").model_dump(mode="json")
            for name, (_, usage) in sorted(TOOLS.items())]


@router.get("/methodologies/condition-fields")
def condition_fields():
    """Reference data for the Condition Builder's Field dropdown: the
    LabProjectState fields loop conditions read at runtime (the two
    list fields conditions count over, the three booleans they test),
    compiled client-side to `simpleeval` over these exact names."""
    return [ConditionField(field="open_contradictions",
                           type="count").model_dump(mode="json"),
            ConditionField(field="pending_tasks",
                           type="count").model_dump(mode="json"),
            ConditionField(field="audit_passed",
                           type="bool").model_dump(mode="json"),
            ConditionField(field="escalate",
                           type="bool").model_dump(mode="json"),
            ConditionField(field="needs_human_approval",
                           type="bool").model_dump(mode="json")]


@router.post("/methodologies/{id}/validate")
def validate_methodology(id: str):
    """Client-triggered validation without saving: the exact
    save-validation path (schema parse + _check_names incl. unknown
    refs, orphaned loop targets, judge/council overlap) with the write
    removed. Reads through methodologies_api.store so tests exercising
    this against a tmp registry validate the same state saves would."""
    from app.api import methodologies as methodologies_api
    from app.models.methodology import Methodology
    try:
        stored = methodologies_api.store.get(id)
    except KeyError:
        raise HTTPException(status_code=404,
                            detail=f"unknown methodology: {id}")
    # Re-parse through the schema (fail-closed on drift — a corrupt
    # on-disk YAML 422s here exactly as a save attempt would, never
    # 500s), then run the shared name/judge checks.
    try:
        m = Methodology(**stored.model_dump(mode="json"))
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    methodologies_api._check_names(m)
    return {"valid": True, "id": id}


@router.get("/custom-nodes")
def list_custom_nodes():
    """Discovered Tier C nodes for the builder palette (PBI-067).
    Parsed with `ast` — never imported: listing must work even when a
    file is broken (import-time failures stay loud at build/validate
    time via discover_custom_nodes). Mirrors CUSTOM_NODES_DIR skipping
    (`_`-prefixed helpers are not nodes)."""
    import ast
    from app.graph.custom_nodes import CUSTOM_NODES_DIR
    rows = []
    if CUSTOM_NODES_DIR.is_dir():
        for f in sorted(CUSTOM_NODES_DIR.glob("*.py")):
            if f.name.startswith("_"):
                continue
            try:
                text = f.read_text(encoding="utf-8")
            except (OSError, ValueError) as exc:
                # ValueError covers UnicodeDecodeError (a subclass):
                # undecodable files are load_error rows, never a
                # listing-wide 500.
                rows.append(CustomNodeInfo(
                    node_id=None, filename=f.name, description="",
                    load_error=f"{f.name} unreadable: {exc}"))
                continue
            try:
                tree = ast.parse(text)
            except (SyntaxError, ValueError) as exc:
                rows.append(CustomNodeInfo(
                    node_id=None, filename=f.name, description="",
                    load_error=f"{f.name} does not parse: {exc}"))
                continue
            doc = ast.get_docstring(tree) or ""
            description = doc.split("\n\n")[0].strip()
            node_id = None
            for stmt in tree.body:
                if isinstance(stmt, ast.Assign):
                    targets, value_node = stmt.targets, stmt.value
                elif isinstance(stmt, ast.AnnAssign) and \
                        stmt.value is not None and \
                        isinstance(stmt.target, ast.Name):
                    # NODE_ID: str = "x" (annotated form) counts too —
                    # the import-based discovery loads it either way.
                    targets, value_node = [stmt.target], stmt.value
                else:
                    continue
                if not any(isinstance(t, ast.Name) and t.id == "NODE_ID"
                           for t in targets):
                    continue
                try:
                    value = ast.literal_eval(value_node)
                except (ValueError, SyntaxError):
                    continue
                if isinstance(value, str) and value:
                    node_id = value
            rows.append(CustomNodeInfo(
                node_id=node_id, filename=f.name,
                description=description,
                load_error=None if node_id else
                f"{f.name} defines no NODE_ID: str"))
    return [r.model_dump(mode="json") for r in rows]
