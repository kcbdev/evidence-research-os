"""PBI-042 gate: LanceDB semantic index + wiring.

The embedder seam is ALWAYS mocked — no model download, ever (asserted
by the no-download test). Retrieval behavior is proven against a
deterministic fake embedding.
"""
import pytest
from app.graph import nodes
from app.models.evidence import (BudgetState, Claim, ProjectMeta, Task)
from app.store.lab_project import LabProjectStore
from app.tools import semantic_index
from app.tools.semantic_index import index_evidence_unit, semantic_search

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _fake_embed(text: str) -> list[float]:
    """Deterministic 3-d stand-in: bag of marker words, L2-ish."""
    t = text.lower()
    return [float("microbe" in t), float("quantum" in t),
            float("barnacle" in t)]


@pytest.fixture()
def no_download(monkeypatch):
    monkeypatch.setattr(semantic_index, "embed", _fake_embed)
    monkeypatch.setattr("app.tools.semantic_index._get_embedder",
                        lambda: (_ for _ in ()).throw(
                            AssertionError("model download attempted")))
    return _fake_embed


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
    store.write_claim(Claim(id="C-2",
                            statement="quantum barnacles migrate north"))
    return store


def test_paraphrase_hit(tmp_path, no_download):
    _seed(tmp_path)
    # "germ" shares no tokens with "microbe" — BM25 would miss; the
    # fake embedding puts microbe-text near microbe-queries.
    hits = semantic_search(tmp_path / "p", "microbe germ effects")
    assert hits[0]["id"] == "C-1"
    assert hits[0]["project_id"] == "p"
    assert all("distance" in h for h in hits)


def test_empty_project_no_build(tmp_path, no_download):
    store = LabProjectStore(tmp_path, "p")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    assert semantic_search(tmp_path / "p", "anything") == []
    assert not (tmp_path / "p" / ".index" / "lancedb").exists()


def test_upsert_and_stale_refresh(tmp_path, no_download):
    store = _seed(tmp_path)
    index_evidence_unit(tmp_path / "p", "X-9", "microbe notes", "p")
    assert semantic_search(tmp_path / "p", "microbe")[0]["id"] in (
        "C-1", "X-9")
    # Upsert replaces, never duplicates.
    index_evidence_unit(tmp_path / "p", "X-9", "quantum notes", "p")
    hits = semantic_search(tmp_path / "p", "quantum")
    assert [h["id"] for h in hits].count("X-9") == 1
    # New YAML invalidates → regenerate picks it up.
    store.write_claim(Claim(id="C-3", statement="barnacle census"))
    hits = semantic_search(tmp_path / "p", "barnacle census data")
    assert "C-3" in [h["id"] for h in hits]


def test_targeted_research_carries_semantic_context(tmp_path, monkeypatch,
                                                    no_download):
    store = _seed(tmp_path)
    seen = {}

    def _fake_call(model, system, user, **k):
        seen["user"] = user
        return "done", 1
    monkeypatch.setattr("app.graph.nodes.call_model_resilient", _fake_call)
    task = Task(id="T-1", question="tell me about barnacles",
                reason="r", assigned_agent="investigator")
    state = {"lab_project_id": "p", "mode": "research",
             "active_question": "q", "budget": BudgetState(),
             "pending_tasks": [task], "open_contradictions": [],
             "escalate": True, "audit_passed": False,
             "needs_human_approval": False, "session_id": "s",
             "first_pass": {}}
    nodes.make_targeted_research(tmp_path)(state)
    assert "semantic index" in seen["user"]
    assert "C-2" in seen["user"]
