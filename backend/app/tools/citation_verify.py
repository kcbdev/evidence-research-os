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
from pathlib import Path
from app.agents.client import call_model_resilient
from app.models.evidence import AuditCheck
from app.store.settings import SettingsStore
from app.tools.cache import cached_fetch_url

AUDITOR_INSTRUCTIONS = "You are a strict citation auditor."


def resolve_auditor(lab_root: Path) -> str | None:
    """Auditor model: settings fallback first, then env. None means
    unconfigured — callers degrade to WARNING, never silent PASS."""
    try:
        configured = SettingsStore(Path(lab_root)).read().models.auditor
    except Exception:
        configured = ""
    return configured or os.environ.get("AUDITOR_MODEL") or None


def check_existence(url: str, lab_project_path: Path,
                    session_id: str) -> tuple[str | None, AuditCheck]:
    """Fetch through the cache. Success = reachable (PASS) + text for
    later stages; any failure = FAIL with the reason, no text."""
    try:
        text = cached_fetch_url(Path(lab_project_path), session_id, url)
    except Exception as exc:
        return None, AuditCheck(stage="existence", status="FAIL",
                                detail=f"Source unreachable: {url} ({exc})")
    return text, AuditCheck(stage="existence", status="PASS")


def check_pincite(location: dict, source_text: str | None) -> AuditCheck:
    """Does the claimed section actually occur in the fetched source?"""
    if source_text is None:
        return AuditCheck(stage="pincite", status="WARNING",
                          detail="no source text (existence failed)")
    section = (location or {}).get("section")
    if section and section.lower() not in source_text.lower():
        return AuditCheck(stage="pincite", status="WARNING",
                          detail=f"Section '{section}' not found "
                                 "in source text")
    return AuditCheck(stage="pincite", status="PASS")


def check_support_match(claim_statement: str, evidence_text_reference: str,
                        auditor_model: str | None) -> tuple[AuditCheck, int]:
    """Model judgment, by a model OUTSIDE the council/judge rotation.
    Returns (check, attempts) — attempts are charged to the budget by the
    caller. Unconfigured auditor → WARNING with reason (spec Decision)."""
    if not auditor_model:
        return AuditCheck(
            stage="support_match", status="WARNING",
            detail="no auditor model configured (settings fallback or "
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
