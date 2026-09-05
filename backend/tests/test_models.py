"""PBI-002 gate: every spec §4.2 object YAML round-trips losslessly.

Fixtures mirror the spec's own examples (S-004, C-017, E-102, I-008,
D-011) so drift between spec text and schema fails loudly here.
"""
import pytest
import yaml
from app.models.evidence import (
    Source, Claim, Evidence, Idea, Task, Decision,
    BudgetState, ProjectMeta,
)


def roundtrip(model_cls, payload):
    first = model_cls(**payload)
    dumped = yaml.safe_dump(first.model_dump(mode="json"))
    second = model_cls(**yaml.safe_load(dumped))
    assert second == first
    return second


def test_source_roundtrip():
    roundtrip(Source, {
        "id": "S-004", "kind": "primary_paper",
        "url": "https://example.org/paper",
        "title": "Example study",
        "retrieved_at": "2026-09-05T10:00:00Z",
        "quality_tier": 2,
        "independence_cluster": None,
    })


def test_source_rejects_bad_tier():
    with pytest.raises(Exception):
        Source(id="S-x", kind="journalism", url="https://e.org",
               title="t", retrieved_at="2026-09-05T10:00:00Z",
               quality_tier=10)


def test_claim_roundtrip():
    roundtrip(Claim, {
        "id": "C-017",
        "statement": "X significantly improves Y.",
        "supporting_sources": ["S-004", "S-021"],
        "opposing_sources": ["S-031"],
        "status": "DISPUTED",
        "confidence": {
            "source_quality": 0.92,
            "methodological_strength": 0.84,
            "independent_confirmation": 0.78,
            "contradiction_level": 0.22,
            "overall": 0.84,
        },
        "adjudicated_by": "judge-model-v1",
    })


def test_claim_rejects_bad_status():
    with pytest.raises(Exception):
        Claim(id="C-x", statement="s", status="MAYBE")


def test_evidence_roundtrip():
    roundtrip(Evidence, {
        "id": "E-102", "source_id": "S-021",
        "location": {"page": 14, "section": "Results"},
        "text_reference": "excerpt",
        "supports": ["C-017"],
        "evidence_type": "empirical",
        "strength": "high",
    })


def test_idea_roundtrip():
    roundtrip(Idea, {
        "id": "I-008",
        "statement": "Novel angle / contrarian framing",
        "novelty_check": {"status": "novel", "against": ["I-002"]},
        "proposed_experiment": {
            "hypothesis": "h",
            "falsification_condition": "f",
            "feasibility": "medium",
        },
        "status": "proposed",
    })


def test_task_roundtrip():
    roundtrip(Task, {
        "id": "T-001", "question": "q", "reason": "r",
        "required_sources": ["S-004"],
        "assigned_agent": "investigator",
    })


def test_decision_roundtrip():
    roundtrip(Decision, {
        "id": "D-011",
        "what": "C-017 adjudicated DISPUTED after targeted research R-042",
        "why": "S-031 (RCT) contradicts S-004/S-021 (observational)",
        "timestamp": "2026-09-05T10:00:00Z",
    })


def test_budget_exhausted():
    assert not BudgetState().exhausted()
    assert BudgetState(calls_used=50).exhausted()
    assert BudgetState(rounds_used=5).exhausted()


def test_project_meta_roundtrip():
    roundtrip(ProjectMeta, {
        "id": "lp-001", "title": "t", "mode": "research",
        "question": "q", "created_at": "2026-09-05T10:00:00Z",
        "budget": {"max_model_calls": 50, "max_research_rounds": 5,
                   "calls_used": 0, "rounds_used": 0},
        "council_models": {"scientist": "m1", "investigator": "m2",
                           "skeptic": "m3"},
        "judge_model": "mj",
    })
