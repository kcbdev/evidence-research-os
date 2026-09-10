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
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse
from app.agents.config import validate_model_assignment
from app.graph.build import build_graph
from app.models.evidence import Decision
from app.store.lab_project import LabProjectStore
from app.api.lab_projects import _root, _store

router = APIRouter()

RESTING = ("awaiting_approval", "done", "failed", "rejected",
           "interrupted")

_lock = threading.Lock()
_runs: dict[str, dict] = {}
_graphs: dict[str, object] = {}


def get_graph(root: Path, project_id: str,
              council_models: dict, judge_model: str,
              mode: str = "research"):
    # Validated EVERY run (project.yaml may change between runs);
    # the compiled graph is structural and safely cached per project
    # (nodes re-read project.yaml live, so caching never bakes models
    # in). Cache key includes mode (PBI-034): a research-compiled graph
    # must never serve a brainstorm run or vice versa. One sqlite FD
    # per project per process lifetime — acceptable MVP;
    # clear_graph_cache() exists for tests/ops (a real closer,
    # exercised in fixture teardown, not duck-typed hope).
    # NOTE: build_graph takes the lab ROOT (nodes append project_id
    # themselves) — passing store.path here doubles the id.
    validate_model_assignment(council_models, judge_model)
    key = str(Path(root) / project_id) + f":{mode}"
    with _lock:
        if key not in _graphs:
            _graphs[key] = build_graph(Path(root), council_models,
                                       judge_model, mode)
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


def _runs_db(root: Path) -> sqlite3.Connection:
    """Single runs.db beside the projects (runtime state, untracked —
    same class as checkpoints: regeneratable only by re-running)."""
    db = sqlite3.connect(str(Path(root) / "runs.db"))
    db.execute("""CREATE TABLE IF NOT EXISTS runs
        (run_id TEXT PRIMARY KEY, project_id TEXT, status TEXT,
         events_json TEXT, error TEXT, updated_at TEXT)""")
    db.commit()
    return db


def _save_run(root: Path, rec: dict):
    with _lock:
        snapshot = (rec["run_id"], rec["project_id"], rec["status"],
                    json.dumps(rec["events"]), rec["error"],
                    datetime.now(timezone.utc).isoformat())
    db = _runs_db(root)
    try:
        db.execute("INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?)",
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
                "SELECT run_id, project_id, status, events_json, error "
                "FROM runs").fetchall()
        finally:
            db.close()
    except sqlite3.Error:
        return 0  # file-level corruption: never crash startup
    revived = 0
    for run_id, project_id, status, events_json, error in rows:
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
                             "initial": None, "root": str(root)}
        revived += 1
    return revived


def _payload(rec: dict) -> dict:
    return {"run_id": rec["run_id"], "project_id": rec["project_id"],
            "status": rec["status"], "events": list(rec["events"]),
            "needs_approval": rec["status"] == "awaiting_approval",
            "error": rec["error"]}


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
    max_research_rounds}, council_models?, judge_model?}. Validates
    models (400 on judge overlap), seeds budget from project.yaml,
    returns {run_id, status}. session_id == run_id == thread_id."""
    root = _root(request)
    store = _store(root, project_id)
    meta = store.read_meta()
    council = payload.get("council_models", meta.council_models)
    judge = payload.get("judge_model", meta.judge_model)
    mode = payload.get("mode", meta.mode)
    # PBI-034: mode is validated here (422), not deep in the graph —
    # fail-closed before any thread/record exists.
    if mode not in ("research", "brainstorm"):
        raise HTTPException(status_code=422,
                            detail=f"unknown mode: {mode!r}")
    try:
        graph = get_graph(root, project_id, council, judge, mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    budget = meta.budget.model_copy()
    # MVP override surface: call/round limits only. max_sources and
    # max_sources_per_claim (ProjectMeta fields) stay project-level —
    # nodes read them live; per-run override is a later refinement.
    for key in ("max_model_calls", "max_research_rounds"):
        if key in (payload.get("budget") or {}):
            setattr(budget, key, payload["budget"][key])
    run_id = uuid.uuid4().hex[:12]
    initial = {
        "lab_project_id": project_id,
        "mode": mode,
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
                         "root": str(root)}
    _save_run(root, _runs[run_id])
    threading.Thread(target=_pump, args=(run_id,), kwargs={"initial": initial},
                     daemon=True).start()
    return {"run_id": run_id, "status": "running"}


@router.get("/{project_id}/runs")
def list_runs(project_id: str, request: Request):
    """Run history for the overview tab: [{run_id, status,
    needs_approval, events_count, error}], newest first. Records
    persist in runs.db, so history (and paused runs) survive backend
    restarts; pre-restart live runs reappear as "interrupted"."""
    _store(_root(request), project_id)  # 404 for unknown projects
    with _lock:
        snapshot = [(r["run_id"], r["status"], len(r["events"]), r["error"])
                    for r in _runs.values()
                    if r["project_id"] == project_id]
    return [{"run_id": rid, "status": status,
             "needs_approval": status == "awaiting_approval",
             "events_count": count, "error": error}
            for rid, status, count, error in reversed(snapshot)]


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
    """Resolve a checkpoint. Body: {decision: approve|reject, note?}.
    Records D-approve-{run} in decisions/ via the store, then resumes
    (approve) or parks (reject). 400 unless awaiting_approval."""
    rec = _record(run_id)
    if rec["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run not found")
    with _lock:
        status = rec["status"]
    if status != "awaiting_approval":
        raise HTTPException(status_code=400,
                            detail=f"run is {status}, nothing to approve")
    decision = (payload or {}).get("decision", "approve")
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=422,
                            detail="decision must be approve or reject")
    store = _store(_root(request), project_id)
    # Lazy graph recompile BEFORE any decision is recorded: after a restart
    # the record exists (rehydrated) but the compiled graph doesn't — rebuild
    # from current project.yaml. A tampered config (e.g. judge overlap)
    # 400s here like start_run, leaving no phantom D-approve-* record.
    # NOTE: no outer `with _lock` here — get_graph() takes _lock itself
    # and threading.Lock is non-reentrant (self-deadlock caught by the
    # restart test's faulthandler dump).
    if decision == "approve" and rec.get("graph") is None:
        try:
            meta = store.read_meta()
            # PBI-034: the run's own mode survives in initial (rehydrate
            # drops graph/initial, but live records keep them) — fall back
            # to project mode only for pre-034 records without initial.
            initial = rec.get("initial") or {}
            mode = initial.get("mode", meta.mode)
            rec["graph"] = get_graph(_root(request), project_id,
                                     meta.council_models, meta.judge_model,
                                     mode)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    past = {"approve": "approved", "reject": "rejected"}[decision]
    store.write_decision(Decision(
        id=f"D-approve-{run_id}",
        what=f"Human {past} run at checkpoint",
        why=(payload or {}).get("note", ""),
        timestamp=datetime.now(timezone.utc)))
    if decision == "reject":
        with _lock:
            rec["status"] = "rejected"
        _save_run(_root(request), rec)
        return {"run_id": run_id, "status": "rejected"}
    with _lock:
        rec["status"] = "running"
    _save_run(_root(request), rec)
    threading.Thread(target=_pump, args=(run_id,), daemon=True).start()
    return {"run_id": run_id, "status": "running"}
