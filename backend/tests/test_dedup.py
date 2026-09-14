"""PBI-043 gate: union-find clustering + final_output hook.
PBI-075: generalized objects clustering (lower claim/idea threshold) +
duplicate reports for claims/ideas.

Embeddings are injected fakes (deterministic); the hook test drives the
real final_output node with the seam mocked (no download).
"""
import math
from app.graph import nodes
from app.models.evidence import (BudgetState, Claim, Idea, ProjectMeta,
                                 Source)
from app.store.lab_project import LabProjectStore
from app.tools.dedup import (CLAIM_IDEA_THRESHOLD, DEDUP_THRESHOLD,
                             cluster_objects, cluster_sources)

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _fake_embed(text: str) -> list[float]:
    t = text.lower()
    return [float("microbe" in t), float("quantum" in t)]


def test_near_duplicates_merge():
    pairs = [("S-1", "microbe study results"),
             ("S-2", "microbe study results extended"),
             ("S-3", "quantum field theory")]
    out = cluster_sources(pairs, embed_fn=_fake_embed)
    assert out["S-1"] == out["S-2"] == "S-1"  # canonical = min id
    assert out["S-3"] == "S-3"


def test_distinct_sources_stay_split():
    pairs = [("S-1", "microbe study results"),
             ("S-2", "quantum field theory")]
    out = cluster_sources(pairs, embed_fn=_fake_embed)
    assert out == {"S-1": "S-1", "S-2": "S-2"}


def test_empty_and_singleton():
    assert cluster_sources([], embed_fn=_fake_embed) == {}
    assert cluster_sources([("S-1", "x")],
                           embed_fn=_fake_embed) == {"S-1": "S-1"}


def test_threshold_pinned():
    assert DEDUP_THRESHOLD == 0.92
    assert CLAIM_IDEA_THRESHOLD == 0.90


def test_objects_threshold_sits_below_sources():
    # PBI-075 rationale, pinned exactly: cosine 0.91 merges claims/ideas
    # but still splits sources (0.01 margin either side — no fp edge).
    vecs = {"a": [1.0, 0.0],
            "b": [0.91, math.sqrt(1.0 - 0.91 ** 2)]}
    pairs = [("X-1", "a"), ("X-2", "b")]
    by_text = lambda text: vecs[text]  # noqa: E731 -- test fake
    merged = cluster_objects(pairs, embed_fn=by_text)
    assert merged == {"X-1": "X-1", "X-2": "X-1"}
    split = cluster_sources(pairs, embed_fn=by_text)
    assert split == {"X-1": "X-1", "X-2": "X-2"}


def _seed(tmp_path, monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    monkeypatch.setattr("app.tools.semantic_index.embed", _fake_embed)
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q", created_at=TS,
        council_models=COUNCIL, judge_model=JUDGE))
    return store


def _state(**over):
    state = {"lab_project_id": "p", "mode": "research",
             "active_question": "q", "budget": BudgetState(),
             "pending_tasks": [], "open_contradictions": [],
             "escalate": False, "audit_passed": True,
             "needs_human_approval": False, "session_id": "s-d",
             "first_pass": {}}
    state.update(over)
    return state


def test_final_output_writes_clusters(tmp_path, monkeypatch):
    store = _seed(tmp_path, monkeypatch)
    for sid, title in (("S-1", "microbe study"),
                       ("S-2", "microbe study replication"),
                       ("S-3", "quantum theory")):
        store.write_source(Source(
            id=sid, kind="primary_paper", url=f"https://e.org/{sid}",
            title=title, retrieved_at=TS, quality_tier=2))
    nodes.make_final_output(tmp_path)(_state())
    assert store.read_source("S-1").independence_cluster == "S-1"
    assert store.read_source("S-2").independence_cluster == "S-1"
    assert store.read_source("S-3").independence_cluster == "S-3"
    # Terminal record still written; no dedup-failure decision.
    assert store.read_decision("D-terminal-s-d").what == "Run ended: completed"
    assert [d.id for d in store.list_decisions()
            if d.id.startswith("D-dedup-")] == []


def test_hook_failure_recorded_not_fatal(tmp_path, monkeypatch):
    store = _seed(tmp_path, monkeypatch)
    store.write_source(Source(
        id="S-1", kind="primary_paper", url="https://e.org/1",
        title="t", retrieved_at=TS, quality_tier=2))
    store.write_source(Source(
        id="S-2", kind="primary_paper", url="https://e.org/2",
        title="t", retrieved_at=TS, quality_tier=2))
    monkeypatch.setattr("app.graph.nodes._cluster_sources",
                        lambda store: (_ for _ in ()).throw(
                            RuntimeError("index gone")))
    nodes.make_final_output(tmp_path)(_state())
    assert store.read_decision("D-terminal-s-d").what == "Run ended: completed"
    assert store.read_decision("D-dedup-s-d").what == "Dedup clustering skipped"


def test_no_event_log_stage_added(tmp_path, monkeypatch):
    """Dedup is a hook, not a stage: the compiled node set never names it."""
    from tests.helpers import default_graph
    _seed(tmp_path, monkeypatch)
    graph = default_graph(tmp_path, "research", COUNCIL, JUDGE)
    assert "dedup" not in set(graph.get_graph().nodes)
    assert not any("cluster" in n for n in graph.get_graph().nodes)


def test_claims_ideas_reports_from_hook(tmp_path, monkeypatch):
    # PBI-075: near-duplicate claims/ideas from (simulated) separate runs
    # land in the same reported cluster; singletons stay unreported.
    from app.models.evidence import Idea
    store = _seed(tmp_path, monkeypatch)
    store.write_claim(Claim(id="C-1", statement="microbe supports bones"))
    store.write_claim(Claim(id="C-2",
                            statement="microbe supports bones replicated"))
    store.write_claim(Claim(id="C-3", statement="quantum forbids all"))
    store.write_idea(Idea(id="I-001", statement="microbe trial idea"))
    store.write_idea(Idea(id="I-002",
                          statement="microbe trial idea extended"))
    nodes.make_final_output(tmp_path)(_state())
    assert store.read_duplicate_report("claims")["clusters"] == {
        "C-1": ["C-1", "C-2"]}
    assert store.read_duplicate_report("ideas")["clusters"] == {
        "I-001": ["I-001", "I-002"]}
    # Terminal record still written; no dedup-failure decision.
    assert store.read_decision("D-terminal-s-d").what == "Run ended: completed"
    assert [d.id for d in store.list_decisions()
            if d.id.startswith("D-dedup-")] == []


def test_no_report_without_duplicates(tmp_path, monkeypatch):
    # PBI-075: no-duplicates is the default state, not an event — the
    # hook writes no report file (and commits no noise) for it.
    store = _seed(tmp_path, monkeypatch)
    store.write_claim(Claim(id="C-1", statement="microbe supports bones"))
    nodes.make_final_output(tmp_path)(_state())
    assert not (store.path / "duplicates" / "claims.yaml").exists()
    assert not (store.path / "duplicates" / "ideas.yaml").exists()
