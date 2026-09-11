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
from app.tools.semantic_index import (backfill_shared_index,
                                      cross_project_search, semantic_search)

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
    hits = semantic_search(tmp_path / "p", "microbe germ effects",
                           project_id="p")
    assert hits[0]["id"] == "C-1"
    assert hits[0]["project_id"] == "p"
    assert all("distance" in h for h in hits)


def test_empty_project_no_build(tmp_path, no_download):
    store = LabProjectStore(tmp_path, "p")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    assert semantic_search(tmp_path / "p", "anything",
                           project_id="p") == []
    assert not (tmp_path / ".shared-index").exists()


def test_stale_refresh_and_backfill(tmp_path, no_download):
    _seed(tmp_path)
    assert backfill_shared_index(tmp_path) == ["p"]  # idempotent op
    assert backfill_shared_index(tmp_path) == ["p"]
    hits = cross_project_search(tmp_path, "microbe")
    assert hits[0]["id"] == "C-1"  # nearest first; all rows returned
    # New YAML invalidates → next scoped search regenerates.
    store = LabProjectStore(tmp_path, "p")
    store.write_claim(Claim(id="C-3", statement="barnacle census"))
    hits = semantic_search(tmp_path / "p", "barnacle census data",
                           project_id="p")
    assert "C-3" in [h["id"] for h in hits]


def test_cross_project_probe(tmp_path, no_download):
    _seed(tmp_path)
    store = LabProjectStore(tmp_path, "q")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    from app.models.evidence import ProjectMeta as PM
    store.write_meta(PM(id="q", title="Q", question="q",
                        created_at="2026-09-05T10:00:00Z",
                        council_models=COUNCIL, judge_model=JUDGE))
    store.write_claim(Claim(id="C-9", statement="microbe census"))
    assert sorted(backfill_shared_index(tmp_path)) == ["p", "q"]
    hits = cross_project_search(tmp_path, "microbe census")
    by_project = {h["project_id"] for h in hits}
    assert {"p", "q"} <= by_project  # hit across project boundary


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


def test_scoped_search_never_leaks_projects(tmp_path, no_download):
    """Batch review: one shared table must not cross-contaminate the
    investigator's project-scoped reads."""
    _seed(tmp_path)
    store = LabProjectStore(tmp_path, "q")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    from app.models.evidence import ProjectMeta as PM
    store.write_meta(PM(id="q", title="Q", question="q",
                        created_at="2026-09-05T10:00:00Z",
                        council_models=COUNCIL, judge_model=JUDGE))
    store.write_claim(Claim(id="C-9", statement="microbe census"))
    backfill_shared_index(tmp_path)
    hits = semantic_search(tmp_path / "p", "microbe", project_id="p")
    assert hits, "expected hits"
    assert all(h["project_id"] == "p" for h in hits)
    assert "__seed__" not in [h["id"] for h in hits]


def test_predicate_guard_rejects_malicious_ids(tmp_path, no_download):
    from app.tools.semantic_index import _check_project_id
    import pytest as _p
    for bad in ("a'b OR '1'='1", "x; DROP TABLE", "../../etc",
                "p\nq", ""):
        with _p.raises(ValueError):
            _check_project_id(bad)
    _check_project_id("slm-project-66fc97")  # sane ids pass
