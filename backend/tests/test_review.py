"""PBI-012 gate: skeptic transcript without silent edits, no-evidence
guard beats consensus, judge verdicts applied, garbage ignored,
tampered models refused, synthesis renders adjudicated claims.

LLM calls mocked at the client boundary; the mock discriminates the
judge by its system prompt.
"""
import pytest
from app.graph import nodes
from app.models.evidence import (BudgetState, Claim, Confidence, Evidence,
                                 ProjectMeta, Source)
from app.store.lab_project import LabProjectStore

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"

JUDGE_TEXT = "STATUS C-ok-001: SUPPORTED\nSTATUS C-garbage-001: NOT_A_STATUS\n"


def _mock(monkeypatch, judge_text=JUDGE_TEXT):
    seen = []

    def fake(model, system, user):
        seen.append({"model": model, "system": system, "user": user})
        if "Evidence Judge" in system:
            return judge_text
        return "skeptic notes here"

    monkeypatch.setattr("app.graph.nodes.call_model", fake)
    return seen


def _seed(tmp_path, meta=None):
    store = LabProjectStore(tmp_path, "p")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    store.write_meta(meta or ProjectMeta(
        id="p", title="Bone Study", question="does D help?", created_at=TS,
        council_models=COUNCIL, judge_model=JUDGE))
    return store


def _state(budget=None, **over):
    state = {
        "lab_project_id": "p", "mode": "research", "active_question": "q",
        "budget": budget or BudgetState(), "pending_tasks": [],
        "open_contradictions": [], "escalate": True, "audit_passed": True,
        "needs_human_approval": False, "session_id": "s-1", "first_pass": {},
    }
    state.update(over)
    return state


def _seed_evidenced_claim(store):
    store.write_source(Source(id="S-1", kind="primary_paper",
                              url="https://e.org/t", title="t",
                              retrieved_at=TS, quality_tier=2))
    store.write_claim(Claim(id="C-ok-001", statement="D helps.",
                            supporting_sources=["S-1"]))
    store.write_evidence(Evidence(id="E-1", source_id="S-1",
                                  location={"section": "Results"},
                                  text_reference="gains observed",
                                  supports=["C-ok-001"],
                                  evidence_type="empirical",
                                  strength="high"))


def test_review_writes_transcript_leaves_claims(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    store.write_claim(Claim(id="C-1", statement="s"))
    before = [(c.id, c.status) for c in store.list_claims()]
    out = nodes.make_adversarial_review(tmp_path)(_state())
    assert (tmp_path / "p" / "debates" / "adversarial.md").read_text() == \
        "skeptic notes here"
    assert [(c.id, c.status) for c in store.list_claims()] == before
    assert out["budget"].calls_used == 1


def test_trap_claim_cannot_ride_consensus(tmp_path, monkeypatch):
    seen = _mock(monkeypatch)
    store = _seed(tmp_path)
    # Three roles "agree": same statement extracted thrice — but NO
    # evidence object backs any of them.
    for role in ("scientist", "investigator", "skeptic"):
        store.write_claim(Claim(id=f"C-{role}-001",
                                statement="D cures everything.",
                                supporting_sources=["S-1"]))
    _seed_evidenced_claim(store)
    out = nodes.make_evidence_adjudication(tmp_path)(_state())
    for role in ("scientist", "investigator", "skeptic"):
        trap = store.read_claim(f"C-{role}-001")
        assert trap.status == "INSUFFICIENT_EVIDENCE"
        assert trap.adjudicated_by == "rule:no-evidence"
    ok = store.read_claim("C-ok-001")
    assert (ok.status, ok.adjudicated_by) == ("SUPPORTED", JUDGE)
    assert out["budget"].calls_used == 1  # one judge call, not four
    judge_calls = [c for c in seen if "Evidence Judge" in c["system"]]
    assert len(judge_calls) == 1 and "C-ok-001" in judge_calls[0]["user"]


def test_garbage_judge_output_leaves_claim(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    store.write_claim(Claim(id="C-garbage-001", statement="g",
                            status="DISPUTED"))
    store.write_source(Source(id="S-9", kind="journalism", url="https://e.org",
                              title="t", retrieved_at=TS, quality_tier=5))
    store.write_evidence(Evidence(id="E-9", source_id="S-9",
                                  location={"section": "s"},
                                  text_reference="t", supports=["C-garbage-001"],
                                  evidence_type="argumentative",
                                  strength="low"))
    nodes.make_evidence_adjudication(tmp_path)(_state())
    claim = store.read_claim("C-garbage-001")
    assert (claim.status, claim.adjudicated_by) == ("DISPUTED", None)


def test_tampered_models_refuse_before_judge(tmp_path, monkeypatch):
    seen = _mock(monkeypatch)
    _seed(tmp_path, ProjectMeta(
        id="p", title="t", question="q", created_at=TS,
        council_models=COUNCIL, judge_model="m-sci"))  # overlap!
    with pytest.raises(ValueError, match="self-preference"):
        nodes.make_evidence_adjudication(tmp_path)(_state())
    assert not any("Evidence Judge" in c["system"] for c in seen)


def test_synthesis_renders_adjudicated_claims(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    store.write_claim(Claim(
        id="C-1", statement="D helps.", status="SUPPORTED",
        supporting_sources=["S-1"], adjudicated_by=JUDGE,
        confidence=Confidence(source_quality=0.9,
                              methodological_strength=0.8,
                              independent_confirmation=0.7,
                              contradiction_level=0.1, overall=0.82)))
    nodes.make_synthesis(tmp_path)(_state())
    report = (tmp_path / "p" / "output" / "report.md").read_text()
    assert "Bone Study" in report and "does D help?" in report
    assert "C-1 — SUPPORTED" in report and "0.82" in report
    assert JUDGE in report
