"""Citation-audit read model + rerun (PBI-040).

Latest returns the most recent AuditRun's rows flattened for the table
(one entry per check); rerun executes the SAME run_audit core as the
graph node (PBI-039) — sync, single-operator scale — and persists a new
run. Scoped rerun (claim_id) still writes a full AuditRun whose results
cover only that claim. Reruns are UNBUDGETED by design (human-triggered,
rare, seconds-long): auditor spend is returned, not charged.
"""
import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from app.api.lab_projects import _root, _store
from app.models.evidence import AuditRun
from app.tools.citation_verify import next_audit_id, run_audit

router = APIRouter()
STATUSES = ("PASS", "WARNING", "FAIL")


@router.get("/{project_id}/audits/latest")
def latest_audit(project_id: str, request: Request,
                 status: str | None = None,
                 claim_id: str | None = None):
    """Most recent audit rows. Filters narrow (status and/or claim);
    empty store → empty list (no audit has run yet). Latest = max
    (created_at, id) — filename sort alone breaks if ids ever unpad."""
    if status is not None and status not in STATUSES:
        raise HTTPException(status_code=422,
                            detail="status must be PASS, WARNING, or FAIL")
    store = _store(_root(request), project_id)
    runs = store.list_audit_runs()
    if not runs:
        return {"audit_run_id": None, "results": []}
    latest = max(runs, key=lambda r: (r.created_at, r.id))
    out = []
    for row in latest.results:
        if claim_id is not None and row.claim_id != claim_id:
            continue
        for check in row.checks:
            if status is not None and check.status != status:
                continue
            out.append({"claim_id": row.claim_id,
                        "evidence_id": row.evidence_id,
                        "stage": check.stage, "status": check.status,
                        "detail": check.detail})
    return {"audit_run_id": latest.id, "results": out}


@router.post("/{project_id}/audits/rerun")
def rerun_audit(project_id: str, request: Request,
                payload: dict | None = None):
    """Re-run the audit now (sync), optionally scoped to one claim."""
    root = _root(request)
    store = _store(root, project_id)
    claim_id = (payload or {}).get("claim_id")
    if claim_id is not None:
        try:
            store.read_claim(claim_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="claim not found")
    # Session ids become cache-dir names: colons (ISO) are illegal on
    # Windows — sanitize (batch-review find: live rerun crashed here).
    stamp = re.sub(r"[^A-Za-z0-9_-]+", "-",
                   datetime.now(timezone.utc).isoformat())
    results, spent = run_audit(root, project_id, f"rerun-{stamp}",
                               claim_filter=claim_id)
    run = AuditRun(id=next_audit_id(store),
                   created_at=datetime.now(timezone.utc),
                   results=results)
    store.write_audit_run(run)
    return {"audit_run_id": run.id,
            "rows": len(results),
            "failed": any(c.status == "FAIL"
                          for r in results for c in r.checks),
            "auditor_calls": spent}
