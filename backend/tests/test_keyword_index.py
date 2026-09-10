"""PBI-041 gate: Tantivy keyword index + targeted-research wiring.

Real Tantivy index on fixture YAML (no mocks at the retrieval seam —
the point is proving the index works); LLM boundary mocked.
"""
import pytest
from app.graph import nodes
from app.models.evidence import (BudgetState, Claim, ProjectMeta, Task)
from app.store.lab_project import LabProjectStore
from app.tools.keyword_index import keyword_search, rebuild_index

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _seed(tmp_path):
    store = LabProjectStore(tmp_path, "p")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q", created_at=TS,
        council_models=COUNCIL, judge_model=JUDGE))
    store.write_claim(Claim(id="C-1",
                            statement="microbe Y causes effect X"))
    return store


def test_seeded_document_found(tmp_path):
    _seed(tmp_path)
    hits = keyword_search(tmp_path / "p", "microbe effect")
    assert [h["id"] for h in hits] == ["C-1"]
    assert "microbe" in hits[0]["snippet"]


def test_empty_project_returns_without_building(tmp_path):
    store = LabProjectStore(tmp_path, "p")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    assert keyword_search(tmp_path / "p", "anything") == []
    assert not (tmp_path / "p" / ".index").exists()


def test_stale_index_rebuilds(tmp_path):
    store = _seed(tmp_path)
    assert keyword_search(tmp_path / "p", "microbe") != []
    store.write_claim(Claim(id="C-2",
                            statement="quantum barnacles migrate north"))
    # New YAML is newer than the index → lazy rebuild picks it up.
    hits = keyword_search(tmp_path / "p", "barnacles")
    assert [h["id"] for h in hits] == ["C-2"]


def test_targeted_research_carries_index_context(tmp_path, monkeypatch):
    store = _seed(tmp_path)
    seen = {}

    def _fake_call(model, system, user, **k):
        seen["user"] = user
        return "done", 1
    monkeypatch.setattr("app.graph.nodes.call_model_resilient", _fake_call)
    task = Task(id="T-1", question="microbe effect follow-up",
                reason="r", assigned_agent="investigator")
    state = {"lab_project_id": "p", "mode": "research",
             "active_question": "q", "budget": BudgetState(),
             "pending_tasks": [task], "open_contradictions": [],
             "escalate": True, "audit_passed": False,
             "needs_human_approval": False, "session_id": "s",
             "first_pass": {}}
    out = nodes.make_targeted_research(tmp_path)(state)
    assert "C-1" in seen["user"]  # prior-art context rode along
    assert "Related prior findings" in seen["user"]
    assert out["pending_tasks"] == []
    assert out["budget"].calls_used == 1


def test_rebuild_is_idempotent(tmp_path):
    _seed(tmp_path)
    rebuild_index(tmp_path / "p")
    rebuild_index(tmp_path / "p")
    hits = keyword_search(tmp_path / "p", "microbe")
    assert [h["id"] for h in hits] == ["C-1"]
