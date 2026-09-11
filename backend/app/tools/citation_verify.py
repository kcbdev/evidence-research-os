"""3-stage citation verification (PBI-039, guide Task 28).

Stages: existence → pincite → support_match (the SourceCheckup failure
mode: real, reachable, on-topic — but doesn't say what's claimed).

Coherence deviation from the guide sketch (documented, not silent): the
sketch probes existence with a raw `httpx.head`. This module treats a
successful `cached_fetch_url` as the existence proof instead — no raw
HTTP in the tool layer (the PBI-009 raw-fetch ban covers tools too),
reruns are free via the tool-output cache, and the fetched text feeds
pincite directly. A fetch failure IS the existence FAIL.
"""
import os
import re
from pathlib import Path
from app.agents.client import call_model_resilient
from app.models.evidence import AuditCheck, ClaimAudit
from app.store.lab_project import LabProjectStore
from app.store.settings import SettingsStore
from app.tools.cache import cached_fetch_url

AUDITOR_INSTRUCTIONS = "You are a strict citation auditor."


def next_audit_id(store: LabProjectStore) -> str:
    """Max-numeric-id + 1 with exists-guard (batch review: len()+1
    collides on concurrent reruns and reuses ids after deletes).
    Residual same-tick race is accepted single-operator risk (runs are
    human-triggered, seconds apart)."""
    taken = set()
    for run in store.list_audit_runs():
        m = re.fullmatch(r"A-(\d+)", run.id)
        if m:
            taken.add(int(m.group(1)))
    n = (max(taken) + 1) if taken else 1
    while f"A-{n:03d}" in {r.id for r in store.list_audit_runs()}:
        n += 1
    return f"A-{n:03d}"


def resolve_auditor(lab_root: Path, council_models: dict | None = None,
                    judge_model: str | None = None
                    ) -> tuple[str | None, str | None]:
    """Auditor model: settings fallback first, then env. Returns
    (model_or_None, note_or_None). An auditor inside the council/judge
    rotation is REFUSED here (returns None + reason) — settings-PUT
    enforcement alone is bypassable via env, and the spec calls this
    check enforced, not conventional. Unconfigured → (None, None);
    callers degrade to WARNING, never silent PASS."""
    try:
        configured = SettingsStore(Path(lab_root)).read().models.auditor
    except Exception:
        configured = ""
    model = configured or os.environ.get("AUDITOR_MODEL") or None
    if model and council_models is not None:
        rotation = {v for v in council_models.values() if v}
        if judge_model:
            rotation.add(judge_model)
        if model in rotation:
            return None, (f"auditor model {model} overlaps the "
                          "council/judge rotation — ignored")
    return model, None


def check_existence(url: str, lab_project_path: Path,
                    session_id: str) -> tuple[str | None, AuditCheck]:
    """Fetch through the cache. Success = reachable (PASS) + text for
    later stages; any failure = FAIL with the reason, no text. Blank
    bodies (JS shells, empty extraction) WARNING — reachable but
    unverifiable, never a silent PASS."""
    try:
        text = cached_fetch_url(Path(lab_project_path), session_id, url)
    except Exception as exc:
        return None, AuditCheck(stage="existence", status="FAIL",
                                detail=f"Source unreachable: {url} ({exc})")
    if not (text or "").strip():
        return None, AuditCheck(stage="existence", status="WARNING",
                                detail=f"Source reachable but empty: {url}")
    return text, AuditCheck(stage="existence", status="PASS",
                            detail="Source reachable")


def check_pincite(location: dict, source_text: str | None) -> AuditCheck:
    """Does the claimed section actually occur in the fetched source?"""
    if source_text is None:
        return AuditCheck(stage="pincite", status="WARNING",
                          detail="no source text (existence failed)")
    section = (location or {}).get("section")
    if not section:
        return AuditCheck(stage="pincite", status="PASS",
                          detail="no section claimed")
    if section.lower() not in source_text.lower():
        return AuditCheck(stage="pincite", status="WARNING",
                          detail=f"Section '{section}' not found "
                                 "in source text")
    return AuditCheck(stage="pincite", status="PASS",
                      detail=f"Section '{section}' found")


def check_support_match(claim_statement: str, evidence_text_reference: str,
                        auditor_model: str | None,
                        auditor_note: str | None = None
                        ) -> tuple[AuditCheck, int]:
    """Model judgment, by a model OUTSIDE the council/judge rotation.
    Returns (check, attempts) — attempts are charged to the budget by the
    caller. Unconfigured (or rotation-refused) auditor → WARNING with
    the reason, never silent PASS."""
    if not auditor_model:
        return AuditCheck(
            stage="support_match", status="WARNING",
            detail=auditor_note or
            "no auditor model configured (settings fallback or "
            "AUDITOR_MODEL env) — support unassessed"), 0
    prompt = (f"Claim: \"{claim_statement}\"\n"
              f"Cited excerpt: \"{evidence_text_reference}\"\n\n"
              "Does this excerpt actually support the specific claim, or "
              "is it merely topically related? Answer PASS, WARNING, or "
              "FAIL with one sentence.")
    result, attempts = call_model_resilient(
        auditor_model, AUDITOR_INSTRUCTIONS, prompt)
    head = result.strip().upper()
    status = "PASS" if head.startswith("PASS") else (
        "FAIL" if head.startswith("FAIL") else "WARNING")
    return AuditCheck(stage="support_match", status=status,
                      detail=result.strip()), attempts


def run_audit(lab_root: Path, project_id: str, session_id: str,
              claim_filter: str | None = None) -> tuple[list[ClaimAudit], int]:
    """Audit every (claim, evidence) pair — or one claim when scoped.
    Shared by the graph node (PBI-039) and the rerun endpoint (PBI-040)
    so both produce identical rows. Returns (rows, auditor_attempts);
    the caller charges the attempts and persists the AuditRun."""
    store = LabProjectStore(Path(lab_root), project_id)
    # NOTE: the per-pair loop follows ev.supports only — Evidence has
    # no oppose link, so opposing_sources get the claim-level sweep
    # above, not pair rows. Intentional (model shape), not an omission.
    meta = store.read_meta()
    auditor, auditor_note = resolve_auditor(
        Path(lab_root), meta.council_models, meta.judge_model)
    project_dir = Path(lab_root) / project_id
    results: list[ClaimAudit] = []
    spent = 0
    known = {s.id for s in store.list_sources()}
    for claim in store.list_claims():
        if claim_filter is not None and claim.id != claim_filter:
            continue
        cited = list(claim.supporting_sources) + list(claim.opposing_sources)
        missing = [sid for sid in cited if sid not in known]
        if missing:
            results.append(ClaimAudit(
                claim_id=claim.id, evidence_id=None,
                checks=[AuditCheck(
                    stage="existence", status="FAIL",
                    detail="cited source ids have no source object: "
                           + ", ".join(sorted(set(missing))))]))
        for ev in store.list_evidence():
            if claim.id not in ev.supports:
                continue
            try:
                source = store.read_source(ev.source_id)
            except FileNotFoundError:
                results.append(ClaimAudit(
                    claim_id=claim.id, evidence_id=ev.id,
                    checks=[AuditCheck(
                        stage="existence", status="FAIL",
                        detail=f"source object {ev.source_id} missing"),
                        AuditCheck(
                        stage="pincite", status="WARNING",
                        detail="no source text (existence failed)"),
                        AuditCheck(
                        stage="support_match", status="WARNING",
                        detail="no source text (existence failed)")]))
                continue
            text, existence = check_existence(source.url, project_dir,
                                              session_id)
            pincite = check_pincite(ev.location, text)
            if text is None:
                support, attempts = AuditCheck(
                    stage="support_match", status="WARNING",
                    detail="no source text (existence failed)"), 0
            else:
                support, attempts = check_support_match(
                    claim.statement, ev.text_reference, auditor,
                    auditor_note)
            spent += attempts
            results.append(ClaimAudit(
                claim_id=claim.id, evidence_id=ev.id,
                checks=[existence, pincite, support]))
    return results, spent
