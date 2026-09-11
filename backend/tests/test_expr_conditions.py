"""PBI-059 gate: Tier B expression conditions.

Sandbox probes must raise (no imports/dunders/calls); true loops and
false falls through on streamed graphs; registry form coexists.
"""
import pytest
from app.graph.compile import build_graph_from_methodology
from app.graph.expr_condition import make_expr_condition
from app.models.evidence import BudgetState, ProjectMeta
from app.models.methodology import Methodology
from app.store.lab_project import LabProjectStore

MODELS = {"scientist": "m-sci", "investigator": "m-inv",
          "skeptic": "m-ske", "judge": "m-judge"}


def _methodology(stages):
    return Methodology(
        id="m-expr", name="n", description="d", is_default=False,
        compatible_modes=["research"], workflow={"stages": stages},
        tools={"enabled": []}, prompts={"set": "x"}, skills={},
        models=dict(MODELS),
        budget_defaults={"max_model_calls": 50,
                         "max_research_rounds": 5})


def _seed(tmp_path, monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q",
        created_at="2026-09-05T10:00:00Z",
        council_models=dict(MODELS), judge_model="m-judge"))
    return store


def _state(**over):
    state = {"lab_project_id": "p", "mode": "research",
             "active_question": "q", "budget": BudgetState(),
             "pending_tasks": [], "open_contradictions": [],
             "escalate": True, "audit_passed": False,
             "needs_human_approval": False, "session_id": "s",
             "first_pass": {}}
    state.update(over)
    return state


def _stages(condition):
    return [
        {"id": "trigger_classifier", "node": "trigger_classifier",
         "route": "route_classifier"},
        {"id": "plan", "node": "plan"},
        {"id": "gate", "node": "plan", **condition,
         "loop_target": "plan"},
        {"id": "final_output", "node": "final_output"},
    ]


def _stream_names(graph, state, thread):
    names = []
    for chunk in graph.stream(
            state, {"configurable": {"thread_id": thread}},
            stream_mode="updates"):
        names.extend(chunk.keys())
    return names


def test_true_expression_loops(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch)
    # Always-true condition: prove looping via the recursion guard
    # (unbounded stream would hang the suite — the guard IS the bound).
    # The guard surfaces as GraphRecursionError; message-matched because
    # the exact class varies by langgraph version.
    m = _methodology(_stages({"loop_condition": "len(open_contradictions) > 0"}))
    graph = build_graph_from_methodology(m, tmp_path)
    with pytest.raises(Exception, match="(?i)recursion"):
        list(graph.stream(
            _state(open_contradictions=["C-1"]),
            {"configurable": {"thread_id": "t-true"},
             "recursion_limit": 8},
            stream_mode="updates"))


def test_false_expression_falls_through(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch)
    m = _methodology(_stages({"loop_condition": "len(open_contradictions) > 0"}))
    graph = build_graph_from_methodology(m, tmp_path)
    names = _stream_names(graph, _state(), "t-false")
    assert names.count("plan") == 1
    assert "final_output" in names


def test_registry_form_coexists(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch)
    m = _methodology(_stages({"loop_while": "has_open_contradictions"}))
    graph = build_graph_from_methodology(m, tmp_path)
    with pytest.raises(Exception, match="(?i)recursion"):
        list(graph.stream(
            _state(open_contradictions=["C-1"]),
            {"configurable": {"thread_id": "t-reg"},
             "recursion_limit": 8},
            stream_mode="updates"))


def test_mutual_exclusion_triple(tmp_path):
    m = _methodology([{
        "id": "a", "node": "plan", "route": "route_audit",
        "loop_condition": "True", "loop_target": "a"}])
    with pytest.raises(ValueError, match="mutually exclusive"):
        build_graph_from_methodology(m, tmp_path)


def test_bad_expression_fails_at_compile(tmp_path):
    m = _methodology([{
        "id": "a", "node": "plan", "loop_condition": "len(('/",
        "loop_target": "a"}])
    with pytest.raises(ValueError, match="loop_condition"):
        build_graph_from_methodology(m, tmp_path)


def test_sandbox_probes_cannot_execute(tmp_path):
    # Safety is the evaluator, not the compiler: hostile input must
    # never execute anything — it evaluates to False (or raises safely
    # inside simpleeval, which the condition converts to False).
    # Proven by absence of side effects, not by exception type.
    marker = tmp_path / "pwned"
    for evil in ("__import__('os').system('x')",
                 "open('x').read()",
                 "(lambda: 1)()",
                 "().__class__.__bases__",
                 f"__import__('pathlib').Path('{marker.as_posix()}').touch()"):
        cond = make_expr_condition(evil)
        assert cond({"open_contradictions": []}) is False
    assert not marker.exists()


def test_missing_fields_read_false():
    cond = make_expr_condition("len(open_contradictions) > 2")
    assert cond({"open_contradictions": ["a", "b", "c"]}) is True
    assert cond({}) is False  # absent field: false, never crash
    assert cond({"open_contradictions": ["a"]}) is False
