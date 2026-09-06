"""Read-model routers (guide §5.3, spec §8): claims (+detail with trace),
decisions, budget, output/report.

The claims SQLite view is DERIVED, never hand-maintained: rebuilt from
claims/*.yaml on every read request (on-demand per the guide — always
fresh, no invalidation protocol to get wrong). The case grep can't do
(status + confidence-range + opposition filtering) is exactly why the
view exists. The .index/ dir is gitignored at both repo and project
level (ADR-0001: derived output).
"""
import sqlite3
from pathlib import Path
import yaml
from fastapi import APIRouter, HTTPException, Request
from app.api.lab_projects import _root, _store

router = APIRouter()


def rebuild_claims_index(lab_project_path: Path) -> Path:
    """Regenerate the queryable claims view from claims/*.yaml."""
    lab_project_path = Path(lab_project_path)
    index_dir = lab_project_path / ".index"
    index_dir.mkdir(parents=True, exist_ok=True)
    db_path = index_dir / "claims.db"
    db = sqlite3.connect(str(db_path))
    try:
        db.execute("""CREATE TABLE IF NOT EXISTS claims
            (id TEXT PRIMARY KEY, status TEXT, confidence REAL,
             opposition INTEGER, statement TEXT)""")
        db.execute("DELETE FROM claims")  # regenerate, not merge
        for path in sorted((lab_project_path / "claims").glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            conf = (data.get("confidence") or {}).get("overall", 0.0)
            db.execute(
                "INSERT INTO claims VALUES (?,?,?,?,?)",
                (data["id"], data["status"], float(conf),
                 len(data.get("opposing_sources") or []),
                 data.get("statement", "")))
        db.commit()
    finally:
        db.close()
    return db_path


def _query(db_path: Path, status=None, min_confidence=0.0,
           has_opposition=None):
    db = sqlite3.connect(str(db_path))
    try:
        query = ("SELECT id, status, confidence, opposition, statement "
                 "FROM claims WHERE confidence >= ?")
        params: list = [min_confidence]
        if status is not None:
            query += " AND status = ?"
            params.append(status)
        if has_opposition is True:
            query += " AND opposition > 0"
        elif has_opposition is False:
            query += " AND opposition = 0"
        query += " ORDER BY id"
        return [dict(zip(("id", "status", "confidence", "opposition",
                           "statement"), row))
                for row in db.execute(query, params)]
    finally:
        db.close()


@router.get("/{project_id}/claims")
def list_claims(project_id: str, request: Request, status: str | None = None,
                min_confidence: float = 0.0,
                has_opposition: bool | None = None):
    """Filterable claims table source. The status+confidence+opposition
    combination is the query grep cannot express — served by the view."""
    store = _store(_root(request), project_id)
    db_path = rebuild_claims_index(store.path)
    return _query(db_path, status, min_confidence, has_opposition)


@router.get("/{project_id}/claims/{claim_id}")
def get_claim(project_id: str, claim_id: str, request: Request):
    """Full claim + linked evidence + linked sources (the trace the
    EvidenceTraceModal renders one click at a time)."""
    store = _store(_root(request), project_id)
    rebuild_claims_index(store.path)
    try:
        claim = store.read_claim(claim_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="claim not found")
    evidence = [e for e in store.list_evidence() if claim_id in e.supports]
    source_ids = set(claim.supporting_sources) | set(claim.opposing_sources)
    source_ids.update(e.source_id for e in evidence)
    sources = []
    for sid in sorted(source_ids):
        try:
            sources.append(store.read_source(sid))
        except FileNotFoundError:
            continue  # dangling link: visible as absent, not fatal
    return {
        "claim": claim.model_dump(mode="json"),
        "evidence": [e.model_dump(mode="json") for e in evidence],
        "sources": [s.model_dump(mode="json") for s in sources],
    }


@router.get("/{project_id}/decisions")
def list_decisions(project_id: str, request: Request):
    """Episodic log (includes checkpoint approvals + terminal records)."""
    store = _store(_root(request), project_id)
    return [d.model_dump(mode="json") for d in store.list_decisions()]


@router.get("/{project_id}/budget")
def get_budget(project_id: str, request: Request):
    """Budget state. No cost estimate: no pricing model exists in MVP,
    so none is invented — calls/rounds remaining is the truth."""
    store = _store(_root(request), project_id)
    budget = store.read_meta().budget
    return {**budget.model_dump(), "exhausted": budget.exhausted()}


@router.get("/{project_id}/output/report")
def get_report(project_id: str, request: Request):
    """Rendered final report markdown (404 until synthesis runs)."""
    store = _store(_root(request), project_id)
    report = store.path / "output" / "report.md"
    if not report.is_file():
        raise HTTPException(status_code=404, detail="no report yet")
    return {"report": report.read_text(encoding="utf-8")}
