"""PBI-048 gate: academic tier segment.

LLM boundary mocked; graph/store real. reproducibility_audit is
deterministic (no LLM) — its fetch goes through the cache seam, mocked
here to stay hermetic.
"""
import pytest
from app.graph import nodes
from tests.helpers import default_graph
from app.models.evidence import (BudgetState, Claim, Confidence, Evidence,
                                 ProjectMeta, Source)
from app.store.lab_project import LabProjectStore
from app.store.methodology import MethodologyStore

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _mock(monkeypatch, judge_text=""):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: (judge_text, 1))
    monkeypatch.setattr("app.tools.citation_verify.cached_fetch_url",
                        lambda *a, **k: "methods and results")
    monkeypatch.setattr("app.tools.cache.cached_fetch_url",
                        lambda *a, **k: "methods and results")


def _seed(tmp_path, monkeypatch, judge_text=""):
    _mock(monkeypatch, judge_text)
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q", created_at=TS,
        council_models=dict(COUNCIL), judge_model=JUDGE))
    return store


def _seed_evidenced(store):
    store.write_source(Source(
        id="S-1", kind="primary_paper", url="https://e.org/1",
        title="t", retrieved_at=TS, quality_tier=2))
    store.write_claim(Claim(
        id="C-1", statement="microbe Y causes effect X",
        supporting_sources=["S-1"], opposing_sources=[],
        status="SUPPORTED",
        confidence=Confidence(source_quality=0.9,
                              methodological_strength=0.5,
                              independent_confirmation=0.8,
                              contradiction_level=0.1, overall=0.7),
        adjudicated_by="m-judge"))
    store.write_evidence(Evidence(
        id="E-1", source_id="S-1", location={"section": "methods"},
        text_reference="we cultured Y and observed X",
        supports=["C-1"], evidence_type="empirical", strength="high"))


def _state(**over):
    state = {"lab_project_id": "p", "mode": "academic",
             "active_question": "does Y cause X?",
             "budget": BudgetState(), "pending_tasks": [],
             "open_contradictions": [], "escalate": True,
             "audit_passed": False, "needs_human_approval": False,
             "session_id": "s-a", "first_pass": {}}
    state.update(over)
    return state


def test_academic_segment_order(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch)
    graph = default_graph(tmp_path, "academic", COUNCIL, JUDGE)
    names = []
    for chunk in graph.stream(
            _state(), {"configurable": {"thread_id": "t"}},
            stream_mode="updates"):
        names.extend(chunk.keys())
    for stage in ("methodology_analysis", "reproducibility_audit"):
        assert stage in names
    assert names.index("evidence_adjudication") < \
        names.index("methodology_analysis") < \
        names.index("reproducibility_audit") < names.index("synthesis")
    assert "evidence_extraction" in names  # academic keeps research base


def test_academic_costs_more_than_research(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch)
    _seed_evidenced(LabProjectStore(tmp_path, "p"))
    academic = default_graph(tmp_path, "academic", COUNCIL, JUDGE)
    out_a = academic.invoke(_state(), {"configurable": {"thread_id": "ta"}})
    research = default_graph(tmp_path, "research", COUNCIL, JUDGE)
    out_r = research.invoke(_state(mode="research"),
                            {"configurable": {"thread_id": "tr"}})
    assert out_a["budget"].calls_used > out_r["budget"].calls_used


def test_methodology_refines_only_that_dimension(tmp_path, monkeypatch):
    store = _seed(
        tmp_path, monkeypatch,
        judge_text="SCORE C-1: 0.95 — preregistered, replicated\n"
                   "SCORE C-ghost: 0.1 — hallucinated, dropped")
    _seed_evidenced(store)
    out = nodes.make_methodology_analysis(tmp_path)(_state())
    assert out["budget"].calls_used == 1
    claim = store.read_claim("C-1")
    assert claim.confidence.methodological_strength == 0.95
    assert claim.confidence.overall == 0.7  # untouched
    assert claim.status == "SUPPORTED"  # untouched
    assert (tmp_path / "p" / "debates" / "methodology.md").is_file()


def test_methodology_skips_confidenceless_claims(tmp_path, monkeypatch):
    store = _seed(tmp_path, monkeypatch, judge_text="SCORE C-1: 0.9 — x")
    store.write_claim(Claim(id="C-1", statement="bare"))
    out = nodes.make_methodology_analysis(tmp_path)(_state())
    assert out["budget"].calls_used == 0  # no evidenced claim, no call
    assert store.read_claim("C-1").confidence is None


def test_methodology_ignores_scores_for_unsent_claims(tmp_path, monkeypatch):
    # Batch review: a SCORE line for a confident claim the node never
    # sent (no evidence) must not be applied.
    store = _seed(
        tmp_path, monkeypatch, judge_text="SCORE C-2: 0.99 — sung")
    _seed_evidenced(store)
    from app.models.evidence import Confidence as Conf
    store.write_claim(Claim(
        id="C-2", statement="unsent but confident",
        confidence=Conf(source_quality=0.5, methodological_strength=0.5,
                        independent_confirmation=0.5,
                        contradiction_level=0.5, overall=0.5)))
    nodes.make_methodology_analysis(tmp_path)(_state())
    assert store.read_claim("C-2").confidence.methodological_strength == 0.5


def test_reproducibility_transcript(tmp_path, monkeypatch):
    store = _seed(tmp_path, monkeypatch)
    _seed_evidenced(store)
    store.write_evidence(Evidence(
        id="E-2", source_id="S-gone", location={}, text_reference="x",
        supports=["C-1"], evidence_type="argumentative", strength="low"))
    nodes.make_reproducibility_audit(tmp_path)(_state())
    text = (tmp_path / "p" / "debates" / "reproducibility.md").read_text(
        encoding="utf-8")
    assert "- E-1: PASS" in text
    assert "- E-2: FAIL" in text


def test_unknown_mode_has_no_default_methodology(tmp_path):
    # Mode validation moved with the cutover: unknown modes resolve to
    # no methodology (runs.py maps this to 422 before any thread).
    with pytest.raises(ValueError, match="no default methodology"):
        MethodologyStore().get_default_for_mode("postdoc")
