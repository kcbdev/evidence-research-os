"""Run lifecycle (spec §8, guide §5.2): start, status, SSE stream, approve.

Runtime model: each run gets a background thread driving graph.stream()
(run_id doubles as thread_id AND session_id — PBI-010/PBI-014 contract).
Graphs are cached per project path (one sqlite FD per project per
process — acceptable single-operator MVP; a close/dispose path is a
documented follow-up, not this PBI). Handlers never touch the
filesystem except through LabProjectStore; the graph owns run state.

SSE posture: the stream replays recorded events then follows live until
a resting status (awaiting_approval/done/failed/rejected/interrupted)
or a 60s cap. Event names are "node" per graph step plus a synthetic
"human_checkpoint" event on pause (spec §9.3: no polling — the frontend
keys its approval modal off that event). Clients reconnect after
approving. Run RECORDS persist in <lab-root>/runs.db (PBI-029), so
history survives restarts; runs live mid-restart resume as
"interrupted" (threads don't survive processes — stated honestly,
never silently resumed).
"""
import asyncio
import hashlib
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse
from app.agents.config import validate_model_assignment
from app.api.lab_projects import AUTO_MODEL, _root, _store
from app.graph.compile import build_graph_from_methodology
from app.models.evidence import Decision
from app.models.methodology import Methodology
from app.store.lab_project import LabProjectStore
from app.store.methodology import MethodologyStore

router = APIRouter()

RESTING = ("awaiting_approval", "done", "failed", "rejected",
           "interrupted")

_lock = threading.Lock()
_runs: dict[str, dict] = {}
_graphs: dict[str, object] = {}


def _methodology_hash(methodology: Methodology) -> str:
    return hashlib.sha256(json.dumps(
        methodology.model_dump(mode="json"),
        sort_keys=True).encode()).hexdigest()[:12]


def _is_unset(value) -> bool:
    """AUTO_MODEL/blank means 'not configured' — the methodology
    fallback applies (PBI-056). This is what makes fresh projects
    runnable under a real default methodology while keeping
    fail-closed behavior when NOTHING real is configured anywhere."""
    return not str(value or "").strip() or value == AUTO_MODEL


def resolve_methodology(mode: str, methodology_id: str | None = None,
                        project_methodology_id: str | None = None
                        ) -> Methodology:
    """Explicit run id > project pin > mode default. Unknown ids 404
    (fail-closed reference — a run must never start on a guessed
    pipeline)."""
    wanted = methodology_id or project_methodology_id
    if wanted is not None:
        try:
            return MethodologyStore().get(wanted)
        except KeyError:
            raise HTTPException(status_code=404,
                                detail=f"unknown methodology: {wanted}")
    try:
        return MethodologyStore().get_default_for_mode(mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _effective_assignment(methodology: Methodology,
                          council_models: dict | None,
                          judge_model: str | None) -> tuple[dict, str]:
    """Single merge point (PBI-056): methodology base under
    project/payload overrides, AUTO/blank meaning inherit. Shared by
    get_graph (compile-time validation) and start_run (state freeze)
    so the two can never diverge."""
    base = {k: v for k, v in methodology.models.items() if k != "judge"}
    explicit = {k: v for k, v in (council_models or {}).items()
                if not _is_unset(v)}
    council = {**base, **explicit}
    judge = methodology.models.get("judge", "")
    if judge_model is not None and not _is_unset(judge_model):
        judge = judge_model
    return council, judge


def get_graph(root: Path, project_id: str, mode: str,
              methodology: Methodology,
              council_models: dict | None = None,
              judge_model: str | None = None):
    # PBI-054 cutover: the methodology file IS the pipeline — resolution
    # (which file) happens in start_run/_ensure_graph; this compiles and
    # caches. Effective assignment = methodology models under project
    # overrides (spec precedence, documented at the call sites), validated
    # EVERY call; a YAML edit changes the content hash, so stale pipelines
    # can never be served from cache. One sqlite FD per cache entry per
    # process lifetime — acceptable MVP; clear_graph_cache() for tests/ops.
    # NOTE: the compiler takes the lab ROOT (nodes append project_id
    # themselves) — passing store.path here doubles the id.
    base = {k: v for k, v in methodology.models.items() if k != "judge"}
    # Project/payload overrides apply only when actually configured —
    # AUTO_MODEL/blank means "inherit the methodology" (PBI-056).
    # Merge itself lives in _effective_assignment (shared with the
    # state freeze below — the two can never diverge).
    council, judge = _effective_assignment(methodology, council_models,
                                           judge_model)
    if mode not in methodology.compatible_modes:
        raise ValueError(
            f"methodology {methodology.id} is not compatible "
            f"with mode {mode!r}")
    if mode == "brainstorm" and "ideator" not in council:
        raise ValueError(
            "brainstorm mode needs an 'ideator' model in council_models")
    validate_model_assignment(council, judge)
    effective = methodology.model_copy(
        update={"models": {**council, "judge": judge}})
    key = (str(Path(root) / project_id) + f":{methodology.id}:"
           + _methodology_hash(effective))
    with _lock:
        if key not in _graphs:
            _graphs[key] = build_graph_from_methodology(
                effective, Path(root))
        return _graphs[key]


def clear_graph_cache():
    """Test/ops helper: close cached sqlite handles and drop the cache
    (prevents FD leaks and Windows tmp-cleanup locks in tests)."""
    with _lock:
        for graph in _graphs.values():
            conn = getattr(getattr(graph, "checkpointer", None),
                           "conn", None)
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
        _graphs.clear()


def _record(run_id: str) -> dict:
    try:
        return _runs[run_id]
    except KeyError:
        raise HTTPException(status_code=404, detail="run not found")


def _resolve_budget(meta, methodology: Methodology,
                    payload_budget: dict | None):
    """Budget precedence (PBI-056): run payload > project.yaml >
    methodology defaults. project.yaml counts as explicit (it always
    carries concrete numbers) EXCEPT untouched 50/5 defaults, which
    defer to the methodology — documented quirk: explicitly setting
    50/5 also defers. Live counters always come from the project."""
    from app.models.evidence import BudgetState
    fresh = BudgetState()
    budget = meta.budget.model_copy()
    if (budget.max_model_calls == fresh.max_model_calls
            and budget.max_research_rounds == fresh.max_research_rounds):
        budget.max_model_calls = \
            methodology.budget_defaults.max_model_calls
        budget.max_research_rounds = \
            methodology.budget_defaults.max_research_rounds
    for key in ("max_model_calls", "max_research_rounds"):
        if key in (payload_budget or {}):
            setattr(budget, key, payload_budget[key])
    return budget


def _ensure_graph(request: Request, store: LabProjectStore,
                  rec: dict, project_id: str):
    """Lazy recompile for records whose compiled graph is gone (post-
    restart rehydrates). Resolves the RUN's methodology (pinned id >
    project pin > mode default, PBI-056) under current project.yaml
    overrides — a tampered config ValueErrors, which callers map to 400
    leaving no phantom records.
    NOTE: no outer `with _lock` here — get_graph() takes _lock itself
    and threading.Lock is non-reentrant (self-deadlock caught by the
    restart test's faulthandler dump)."""
    if rec.get("graph") is not None:
        return
    meta = store.read_meta()
    initial = rec.get("initial") or {}
    mode = (rec.get("mode") or initial.get("mode") or meta.mode)
    methodology = resolve_methodology(
        mode, rec.get("methodology_id"), meta.methodology_id)
    rec["graph"] = get_graph(_root(request), project_id, mode,
                             methodology, meta.council_models,
                             meta.judge_model)


def _runs_db(root: Path) -> sqlite3.Connection:
    """Single runs.db beside the projects (runtime state, untracked —
    same class as checkpoints: regeneratable only by re-running)."""
    db = sqlite3.connect(str(Path(root) / "runs.db"))
    db.execute("""CREATE TABLE IF NOT EXISTS runs
        (run_id TEXT PRIMARY KEY, project_id TEXT, status TEXT,
         events_json TEXT, error TEXT, updated_at TEXT)""")
    # Schema evolution without wiping history (PBI-034 added mode;
    # PBI-044 adds started_at/duration_s the same way). CREATE TABLE
    # alone cannot migrate existing DBs; ALTER-if-missing can.
    cols = {r[1] for r in db.execute("PRAGMA table_info(runs)")}
    for col, ctype in (("mode", "TEXT"), ("started_at", "TEXT"),
                       ("duration_s", "REAL"),
                       ("methodology_id", "TEXT")):  # PBI-056
        if col not in cols:
            db.execute(f"ALTER TABLE runs ADD COLUMN {col} {ctype}")
    db.commit()
    return db


def _save_run(root: Path, rec: dict):
    now = datetime.now(timezone.utc)
    with _lock:
        mode = rec.get("mode") or (rec.get("initial") or {}).get(
            "mode", "research")
        # duration_s is set only at rest (running rows stay NULL —
        # a live duration would lie on every poll).
        duration = None
        started = rec.get("started_at")
        if rec["status"] in RESTING and started:
            try:
                duration = (now - datetime.fromisoformat(started)
                            ).total_seconds()
            except ValueError:
                duration = None
        snapshot = (rec["run_id"], rec["project_id"], rec["status"],
                    json.dumps(rec["events"]), rec["error"],
                    now.isoformat(), mode, started, duration,
                    rec.get("methodology_id"))
    db = _runs_db(root)
    try:
        db.execute("INSERT OR REPLACE INTO runs "
                   "(run_id, project_id, status, events_json, error, "
                   "updated_at, mode, started_at, duration_s, "
                   "methodology_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                   snapshot)
        db.commit()
    finally:
        db.close()


def rehydrate_runs(root: Path) -> int:
    """Rebuild the registry from runs.db (called at startup). Runs
    caught mid-flight become "interrupted" — their threads died with
    the old process and resuming them silently would lie. Paused runs
    keep awaiting_approval: their checkpoints persist, so approve still
    works (graph recompiles on demand). Malformed rows are skipped."""
    root = Path(root)
    if not (root / "runs.db").exists():
        return 0
    try:
        db = _runs_db(root)
        try:
            rows = db.execute(
                "SELECT run_id, project_id, status, events_json, error, "
                "mode, started_at, duration_s, methodology_id "
                "FROM runs").fetchall()
        finally:
            db.close()
    except sqlite3.Error:
        return 0  # file-level corruption: never crash startup
    revived = 0
    for run_id, project_id, status, events_json, error, mode, \
            started_at, duration_s, methodology_id in rows:
        try:
            events = json.loads(events_json or "[]")
            assert isinstance(events, list)
        except Exception:
            continue  # corrupt row: skip, never crash startup
        if status == "running":
            status = "interrupted"
        with _lock:
            _runs[run_id] = {"run_id": run_id, "project_id": project_id,
                             "status": status, "events": events,
                             "error": error, "graph": None,
                             "initial": None, "root": str(root),
                             "mode": mode or "research",
                             "started_at": started_at,
                             "duration_s": duration_s,
                             "methodology_id": methodology_id}
        revived += 1
    return revived


def _payload(rec: dict) -> dict:
    return {"run_id": rec["run_id"], "project_id": rec["project_id"],
            "status": rec["status"], "events": list(rec["events"]),
            "needs_approval": rec["status"] == "awaiting_approval",
            "error": rec["error"],
            "mode": rec.get("mode", "research"),
            "started_at": rec.get("started_at"),
            "duration_s": rec.get("duration_s"),
            "methodology_id": rec.get("methodology_id")}


def _pump(run_id: str, initial=None):
    """Drive the graph to rest (pause or END), recording node events."""
    rec = _runs[run_id]
    graph = rec["graph"]
    root = Path(rec["root"])
    config = {"configurable": {"thread_id": run_id}}
    try:
        for chunk in graph.stream(initial, config, stream_mode="updates"):
            with _lock:
                rec["events"].extend({"node": node} for node in chunk)
            _save_run(root, rec)
        nxt = tuple(graph.get_state(config).next)
        with _lock:
            if nxt:
                rec["status"] = "awaiting_approval"
                # Synthetic typed event: the frontend keys its approval
                # modal off event name "human_checkpoint" (spec §9.3).
                rec["events"].append({"node": "human_checkpoint",
                                      "etype": "human_checkpoint"})
            else:
                rec["status"] = "done"
                # Terminal event (PBI-018): the stream would otherwise end
                # silently and the UI could only poll for completion.
                rec["events"].append({"node": "done",
                                      "etype": "run_done"})
        _save_run(root, rec)
    except Exception as exc:  # never leave a run stuck in "running"
        with _lock:
            rec["status"] = "failed"
            rec["error"] = str(exc)
        _save_run(root, rec)


@router.post("/{project_id}/runs")
def start_run(project_id: str, payload: dict, request: Request):
    """Start a run. Body: {mode?, question?, budget?{max_model_calls,
    max_research_rounds}, council_models?, judge_model?,
    methodology_id?}. Precedence (PBI-056, explicit and documented):
    methodology selected by explicit run id > project pin > mode
    default; models = methodology base under project/payload overrides
    (AUTO/blank means inherit); budget = payload > project >
    methodology defaults. Validates models (400 on judge overlap),
    returns {run_id, status, methodology_id}.
    session_id == run_id == thread_id."""
    root = _root(request)
    store = _store(root, project_id)
    meta = store.read_meta()
    council = payload.get("council_models", meta.council_models)
    judge = payload.get("judge_model", meta.judge_model)
    mode = payload.get("mode", meta.mode)
    # PBI-034: mode is validated here (422), not deep in the graph —
    # fail-closed before any thread/record exists. PBI-048 adds academic.
    if mode not in ("research", "brainstorm", "academic"):
        raise HTTPException(status_code=422,
                            detail=f"unknown mode: {mode!r}")
    methodology = resolve_methodology(
        mode, (payload or {}).get("methodology_id"),
        meta.methodology_id)
    try:
        graph = get_graph(root, project_id, mode, methodology,
                          council, judge)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    budget = _resolve_budget(meta, methodology, payload.get("budget"))
    run_id = uuid.uuid4().hex[:12]
    started_at = datetime.now(timezone.utc).isoformat()
    # Freeze the effective models into state (PBI-056 firewall): nodes
    # use these, never project.yaml mid-run. Re-resolved fresh on every
    # start; checkpointed state carries them across pause/resume.
    eff_council, eff_judge = _effective_assignment(
        methodology, council, judge)
    initial = {
        "lab_project_id": project_id,
        "mode": mode,
        "models": {"council": eff_council, "judge": eff_judge},
        "active_question": payload.get("question", meta.question),
        "budget": budget, "pending_tasks": [], "open_contradictions": [],
        "escalate": False, "audit_passed": False,
        "needs_human_approval": False, "session_id": run_id,
        "first_pass": {},
    }
    with _lock:
        _runs[run_id] = {"run_id": run_id, "project_id": project_id,
                         "status": "running", "events": [], "error": None,
                         "graph": graph, "initial": initial,
                         "root": str(root), "mode": mode,
                         "methodology_id": methodology.id,
                         "started_at": started_at, "duration_s": None}
    _save_run(root, _runs[run_id])
    threading.Thread(target=_pump, args=(run_id,), kwargs={"initial": initial},
                     daemon=True).start()
    return {"run_id": run_id, "status": "running",
            "methodology_id": methodology.id}


@router.get("/{project_id}/runs")
def list_runs(project_id: str, request: Request):
    """Run history for the overview tab: [{run_id, status,
    needs_approval, events_count, error}], newest first. Records
    persist in runs.db, so history (and paused runs) survive backend
    restarts; pre-restart live runs reappear as "interrupted"."""
    _store(_root(request), project_id)  # 404 for unknown projects
    with _lock:
        snapshot = [(r["run_id"], r["status"], len(r["events"]), r["error"],
                     r.get("mode", "research"), r.get("started_at"),
                     r.get("duration_s"), r.get("methodology_id"))
                    for r in _runs.values()
                    if r["project_id"] == project_id]
    return [{"run_id": rid, "status": status,
             "needs_approval": status == "awaiting_approval",
             "events_count": count, "error": error,
             "mode": mode, "started_at": started_at,
             "duration_s": duration_s, "methodology_id": methodology_id}
            for rid, status, count, error, mode, started_at, duration_s,
            methodology_id in reversed(snapshot)]


@router.get("/{project_id}/runs/{run_id}")
def get_run(project_id: str, run_id: str):
    """Run status. Returns {run_id, project_id, status, events,
    needs_approval, error}. Events are [{node}] in execution order
    plus a terminal {node: human_checkpoint} record on pause."""
    rec = _record(run_id)
    if rec["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run not found")
    with _lock:
        return _payload(rec)


@router.get("/{project_id}/runs/{run_id}/stream")
async def stream_run(project_id: str, run_id: str):
    """SSE stream. Shape per event: {event: <type>, data: <JSON>} where
    type is "node" per graph step or "human_checkpoint" on pause
    (frontend keys its approval modal off that name, spec §9.3).
    Replays history then follows live to a resting status."""
    rec = _record(run_id)
    if rec["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run not found")

    async def gen():
        seen = 0
        for _ in range(300):  # 60s cap at 0.2s polls
            with _lock:
                events, status = list(rec["events"]), rec["status"]
            while seen < len(events):
                ev = events[seen]
                yield {"event": ev.get("etype", "node"),
                       "data": json.dumps(ev)}
                seen += 1
            if status in RESTING:
                return
            await asyncio.sleep(0.2)

    return EventSourceResponse(gen())


@router.post("/{project_id}/runs/{run_id}/approve")
def approve_run(project_id: str, run_id: str, payload: dict,
                request: Request):
    """Resolve a checkpoint. Body: {decision: approve|reject|edit,
    note?, edited_content? (edit only)}. Records D-approve-{run} (for
    both approve and reject) or D-edit-{run} in decisions/ via the
    store, then resumes (approve, edit) or parks (reject). 400 unless
    awaiting_approval.

    Edit-and-continue (PBI-052): the pending synthesis draft IS
    output/report.md (synthesis already ran upstream of the
    checkpoint), so the edit replaces that draft in place plus a full
    copy in debates/ scratch; resume then ships the edited draft.
    Re-running synthesis would regenerate from claims and discard the
    edit — that path is deliberately NOT taken."""
    rec = _record(run_id)
    if rec["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run not found")
    with _lock:
        status = rec["status"]
    if status != "awaiting_approval":
        raise HTTPException(status_code=400,
                            detail=f"run is {status}, nothing to approve")
    decision = (payload or {}).get("decision", "approve")
    if decision not in ("approve", "reject", "edit"):
        raise HTTPException(status_code=422,
                            detail="decision must be approve, reject, "
                                   "or edit")
    store = _store(_root(request), project_id)
    # Lazy graph recompile BEFORE any decision is recorded: after a restart
    # the record exists (rehydrated) but the compiled graph doesn't.
    # A tampered config (e.g. judge overlap) 400s here like start_run,
    # leaving no phantom D-approve-* record.
    if decision in ("approve", "edit") and rec.get("graph") is None:
        try:
            _ensure_graph(request, store, rec, project_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if decision == "reject":
        store.write_decision(Decision(
            id=f"D-approve-{run_id}",
            what="Human rejected run at checkpoint",
            why=(payload or {}).get("note", ""),
            timestamp=datetime.now(timezone.utc)))
        with _lock:
            rec["status"] = "rejected"
        _save_run(_root(request), rec)
        return {"run_id": run_id, "status": "rejected"}
    if decision == "edit":
        edited = (payload or {}).get("edited_content", "")
        if not isinstance(edited, str) or not edited.strip():
            raise HTTPException(status_code=422,
                                detail="edited_content is required "
                                       "for edit")
        draft = store.path / "output" / "report.md"
        if not draft.is_file():
            raise HTTPException(status_code=400,
                                detail="no synthesis draft to edit yet")
        # Copy-first ordering: the debates backup lands BEFORE the
        # destructive draft overwrite, so a mid-write crash can never
        # leave a mutated draft with no record.
        debates = store.path / "debates"
        debates.mkdir(parents=True, exist_ok=True)
        (debates / f"approval-edit-{run_id}.md").write_text(
            edited, encoding="utf-8")
        draft.write_text(edited, encoding="utf-8")
        store.write_decision(Decision(
            id=f"D-edit-{run_id}",
            what="Human edited synthesis draft at checkpoint",
            why=(payload or {}).get("note", ""),
            timestamp=datetime.now(timezone.utc)))
    else:
        store.write_decision(Decision(
            id=f"D-approve-{run_id}",
            what="Human approved run at checkpoint",
            why=(payload or {}).get("note", ""),
            timestamp=datetime.now(timezone.utc)))
    with _lock:
        rec["status"] = "running"
    _save_run(_root(request), rec)
    threading.Thread(target=_pump, args=(run_id,), daemon=True).start()
    return {"run_id": run_id, "status": "running"}


@router.post("/{project_id}/runs/{run_id}/retry")
def retry_run(project_id: str, run_id: str, request: Request):
    """Explicit recovery (PBI-044): re-drive a `failed` or `interrupted`
    run from its LangGraph checkpoint under the SAME run_id/thread
    (run==thread contract kept — no new id, continuation events append).
    400 for any other status. Interrupted runs CAN retry: threads die
    with the process, but checkpoints persist — this explicit action is
    the honest resume path PBI-029 forbade only silently."""
    rec = _record(run_id)
    if rec["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run not found")
    with _lock:
        status = rec["status"]
    if status not in ("failed", "interrupted"):
        raise HTTPException(
            status_code=400,
            detail=f"run is {status}: only failed/interrupted runs retry")
    store = _store(_root(request), project_id)
    try:
        _ensure_graph(request, store, rec, project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    with _lock:
        rec["status"] = "running"
        rec["error"] = None
    _save_run(_root(request), rec)
    # No initial: stream(None, config) resumes the thread checkpoint.
    threading.Thread(target=_pump, args=(run_id,), daemon=True).start()
    return {"run_id": run_id, "status": "running"}
