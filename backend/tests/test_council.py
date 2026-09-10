"""PBI-011 gate: concurrent isolated council, extraction protocol, cheap
conflict detector, targeted loop with budget termination.

LLM calls are mocked at the client boundary (no live OpenRouter); the
mock discriminates roles by their system prompts. Every graph/branch
assertion below is executed against the real wiring.
"""
import pytest
from app.agents.prompts import load_prompt
from app.graph import nodes
from tests.helpers import default_graph
from app.graph.nodes import parse_findings
from app.models.evidence import BudgetState, ProjectMeta
from app.store.lab_project import LabProjectStore

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"

SCIENTIST_TEXT = (
    "CLAIM: Vitamin D supports bone density.\n"
    "EVIDENCE: Trial showed gains || https://e.org/trial || Results || empirical\n"
)
INVESTIGATOR_TEXT = (
    "CLAIM: Sunlight raises vitamin D levels.\n"
    "EVIDENCE: Survey data || https://e.org/sun || Abstract\n"
    "GARBAGE LINE WITHOUT PREFIX\n"
    "EVIDENCE: incomplete\n"
)
SKEPTIC_TEXT = (
    "CHALLENGE: Vitamin D does not support bone density.\n"
    "CHALLENGE: Chocolate cures everything.\n"
)


def _mock_llm(monkeypatch):
    seen = []

    def fake(model, system, user):
        seen.append({"model": model, "system": system, "user": user})
        if "Scientist" in system:
            return SCIENTIST_TEXT, 1
        if "Investigator" in system:
            return INVESTIGATOR_TEXT, 1
        if "Skeptic" in system:
            return SKEPTIC_TEXT, 1
        return "targeted finding", 1

    monkeypatch.setattr("app.graph.nodes.call_model_resilient", fake)
    return seen


def _meta(over=None):
    payload = {"id": "p", "title": "t", "question": "q",
               "created_at": TS, "council_models": COUNCIL,
               "judge_model": JUDGE}
    payload.update(over or {})
    return ProjectMeta(**payload)


def _seed_project(tmp_path, meta=None):
    store = LabProjectStore(tmp_path, "p")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    store.write_meta(meta or _meta())
    return store


def _state(budget=None, **over):
    state = {
        "lab_project_id": "p", "mode": "research",
        "active_question": "does vitamin D help bones?",
        "budget": budget or BudgetState(), "pending_tasks": [],
        "open_contradictions": [], "escalate": True,
        "audit_passed": True, "needs_human_approval": False,
        "session_id": "s-1", "first_pass": {},
    }
    state.update(over)
    return state


def test_prompts_load_per_role():
    for role in ("scientist", "investigator", "skeptic", "judge"):
        assert len(load_prompt(role)) > 50
    with pytest.raises(ValueError, match="unknown council role"):
        load_prompt("oracle")


def test_parse_findings_protocol():
    events, skipped = parse_findings(
        "CLAIM: s1\n"
        "EVIDENCE: ex || https://e.org/x || p3 || bogus-type\n"
        "EVIDENCE: broken\n"
        "CHALLENGE: s2\n"
        "noise\n")
    assert events == [
        ("claim", "s1"),
        ("evidence", "ex", "https://e.org/x", "p3", "argumentative"),
        ("challenge", "s2"),
    ]
    assert skipped == 2  # malformed evidence line + noise line


def test_overlap_boundary():
    from app.graph.nodes import _overlap, CHALLENGE_OVERLAP
    hit = _overlap("Vitamin D does not support bone density.",
                   "Vitamin D supports bone density.")
    miss = _overlap("Chocolate cures everything.",
                    "Vitamin D supports bone density.")
    assert hit >= CHALLENGE_OVERLAP > miss


def test_first_pass_isolated_and_partial(tmp_path, monkeypatch):
    _seed_project(tmp_path)
    seen = _mock_llm(monkeypatch)
    node = nodes.make_independent_first_pass(tmp_path)
    budget = BudgetState()
    out = node(_state(budget=budget))
    assert set(out["first_pass"]) == {"scientist", "investigator", "skeptic"}
    assert out["first_pass"]["scientist"] == SCIENTIST_TEXT
    # Isolation: no role saw another role's output, only question + format.
    for call in seen:
        assert "Vitamin D supports" not in call["user"]
        assert "CLAIM:" in call["user"]  # format block present
    assert out["budget"].calls_used == 3
    assert budget.calls_used == 0  # input untouched: partial-update proof
    assert "session_id" not in out  # partials merge; nothing else leaks


def test_extraction_writes_typed_objects(tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    store = _seed_project(tmp_path)
    node = nodes.make_evidence_extraction(tmp_path)
    node(_state(first_pass={"scientist": SCIENTIST_TEXT,
                            "investigator": INVESTIGATOR_TEXT,
                            "skeptic": SKEPTIC_TEXT}))
    assert [(c.id, c.status) for c in store.list_claims()] == [
        ("C-investigator-001", "INSUFFICIENT_EVIDENCE"),
        ("C-scientist-001", "INSUFFICIENT_EVIDENCE")]
    ev = store.list_evidence()
    assert [(e.id, e.evidence_type, e.supports) for e in ev] == [
        ("E-investigator-001", "argumentative", ["C-investigator-001"]),
        ("E-scientist-001", "empirical", ["C-scientist-001"])]
    src = store.list_sources()
    assert [(s.id, s.kind, s.quality_tier) for s in src] == [
        ("S-investigator-001", "web_content", 9),
        ("S-scientist-001", "web_content", 9)]


def test_extraction_enforces_per_claim_cap(tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    store = _seed_project(tmp_path, _meta({"max_sources_per_claim": 1}))
    node = nodes.make_evidence_extraction(tmp_path)
    node(_state(first_pass={"scientist": (
        "CLAIM: Per-claim cap test statement here\n"
        "EVIDENCE: First supporting excerpt text || https://e.org/1 || p1\n"
        "EVIDENCE: Second supporting excerpt text || https://e.org/2 || p2\n")}))
    assert [e.id for e in store.list_evidence()] == ["E-scientist-001"]


def test_extraction_enforces_global_source_cap(tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    from app.models.evidence import Source
    store = _seed_project(tmp_path, _meta({"max_sources": 2}))
    store.write_source(Source(id="S-old-001", kind="primary_paper",
                              url="https://e.org/old", title="t",
                              retrieved_at=TS, quality_tier=1))
    node = nodes.make_evidence_extraction(tmp_path)
    node(_state(first_pass={"scientist": (
        "CLAIM: Per-claim cap test statement here\n"
        "EVIDENCE: First supporting excerpt text || https://e.org/1 || p1\n"
        "EVIDENCE: Second supporting excerpt text || https://e.org/2 || p2\n"
        "EVIDENCE: Third supporting excerpt text || https://e.org/3 || p3\n")}))
    urls = sorted(s.url for s in store.list_sources())
    # Pre-existing source counts toward the cap: only ONE new source minted.
    assert urls == ["https://e.org/1", "https://e.org/old"]
    assert len(store.list_evidence()) == 1


def test_conflict_upserts_changed_reason_and_prunes_resolved(
        tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    store = _seed_project(tmp_path)
    from app.models.evidence import Task
    store.write_task(Task(id="T-C-gone", question="q",
                          reason="stale", assigned_agent="investigator"))
    store.write_task(Task(id="T-C-scientist-001", question="q",
                          reason="stale reason",
                          assigned_agent="investigator"))
    nodes.make_evidence_extraction(tmp_path)(_state(first_pass={
        "scientist": SCIENTIST_TEXT, "investigator": "", "skeptic": ""}))
    out = nodes.make_conflict_detection(tmp_path)(_state(first_pass={
        "scientist": "", "investigator": "", "skeptic": SKEPTIC_TEXT}))
    assert out["open_contradictions"] == ["C-scientist-001"]
    # stale non-matching task pruned, changed reason upserted:
    assert store.read_task("T-C-scientist-001").reason.startswith(
        "Skeptic challenge:")
    assert not (store.path / "tasks" / "T-C-gone.yaml").exists()


def test_targeted_counts_calls_and_round(tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    _seed_project(tmp_path)
    from app.models.evidence import Task
    budget = BudgetState(max_model_calls=100, max_research_rounds=5)
    tasks = [Task(id="T-a", question="qa", reason="r",
                  assigned_agent="investigator"),
             Task(id="T-b", question="qb", reason="r",
                  assigned_agent="skeptic")]
    out = nodes.make_targeted_research(tmp_path)(
        _state(budget=budget, pending_tasks=tasks))
    assert out["pending_tasks"] == []
    assert (out["budget"].calls_used, out["budget"].rounds_used) == (2, 1)
    assert budget.calls_used == 0  # input copy, not mutation


def test_degenerate_findings_dropped(tmp_path, monkeypatch):
    # Live witness: a model wrote `CLAIM: ...` and the table showed
    # literal dots. Placeholders carry no prose — dropped, unnumbered.
    _mock_llm(monkeypatch)
    store = _seed_project(tmp_path)
    nodes.make_evidence_extraction(tmp_path)(_state(first_pass={
        "scientist": (
            "CLAIM: ...\n"
            "EVIDENCE: ... || https://e.org/x || p1\n"
            "CLAIM: Real finding with substance here\n"
            "EVIDENCE: Solid excerpt text || https://e.org/y || p2\n")}))
    assert [c.id for c in store.list_claims()] == ["C-scientist-001"]
    assert [e.id for e in store.list_evidence()] == ["E-scientist-001"]
    assert [s.url for s in store.list_sources()] == ["https://e.org/y"]


def test_conflict_detects_challenge_match(tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    store = _seed_project(tmp_path)
    nodes.make_evidence_extraction(tmp_path)(_state(first_pass={
        "scientist": SCIENTIST_TEXT, "investigator": "", "skeptic": ""}))
    out = nodes.make_conflict_detection(tmp_path)(_state(first_pass={
        "scientist": "", "investigator": "", "skeptic": SKEPTIC_TEXT}))
    assert out["open_contradictions"] == ["C-scientist-001"]
    assert [t.id for t in out["pending_tasks"]] == ["T-C-scientist-001"]
    task = store.read_task("T-C-scientist-001")
    assert task.assigned_agent == "investigator"


def test_conflict_clean_fixture_flows_to_review(tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    _seed_project(tmp_path)
    out = nodes.make_conflict_detection(tmp_path)(_state(first_pass={
        "scientist": SCIENTIST_TEXT, "skeptic": "nothing disputed"}))
    assert out["open_contradictions"] == [] and out["pending_tasks"] == []


def test_exhausted_mid_loop_ends_at_final_output(tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    _seed_project(tmp_path)
    proj = tmp_path  # graph root == lab-projects root for these nodes
    graph = default_graph(proj, "research", COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    budget = BudgetState(max_model_calls=50, max_research_rounds=5,
                         calls_used=48)  # +3 in first pass exhausts calls
    graph.invoke(_state(budget=budget), config)
    assert tuple(graph.get_state(config).next) == ()  # END, not review
    # targeted never ran: debates/ exists from project layout, but holds
    # no transcripts:
    assert list((proj / "p" / "debates").glob("T-*.md")) == []


def test_contradiction_loop_terminates_on_rounds(tmp_path, monkeypatch):
    _mock_llm(monkeypatch)
    _seed_project(tmp_path)
    graph = default_graph(tmp_path, "research", COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    state = _state(budget=BudgetState(max_model_calls=500,
                                      max_research_rounds=1))
    # Seed extracted claims + skeptic text so the first pass rediscovers them.
    nodes.make_evidence_extraction(tmp_path)(_state(first_pass={
        "scientist": SCIENTIST_TEXT, "investigator": INVESTIGATOR_TEXT,
        "skeptic": ""}))
    result = graph.invoke(state, config)  # must terminate, not loop forever
    assert tuple(graph.get_state(config).next) == ()
    assert result["budget"].rounds_used == 1
    debates = list((tmp_path / "p" / "debates").glob("T-*.md"))
    assert len(debates) == 1 and "Sunlight raises" in debates[0].read_text(encoding="utf-8")
