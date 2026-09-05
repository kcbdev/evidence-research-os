"""PBI-007 gate: hard stops end runs cleanly, never mid-call.

Drives the PBI-006 skeleton graph to both limits: an exhausted budget
must reach END with no council work (no plan file); a fresh budget
keeps the escalation path.
"""
from app.graph.budget import consume_calls, consume_round, is_exhausted
from app.graph.build import build_graph
from app.models.evidence import BudgetState
from app.graph.state import LabProjectState

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def make_state(budget: BudgetState) -> LabProjectState:
    return {
        "lab_project_id": "p", "mode": "research",
        "active_question": "q", "budget": budget,
        "pending_tasks": [], "open_contradictions": [],
        "escalate": False, "audit_passed": True,
        "needs_human_approval": False,
    }


def test_helpers_consume_and_detect():
    state = make_state(BudgetState(max_model_calls=3, max_research_rounds=2))
    assert not is_exhausted(state)
    consume_calls(state, 2)
    assert state["budget"].calls_used == 2
    assert not is_exhausted(state)
    consume_round(state)
    assert state["budget"].rounds_used == 1
    consume_calls(state)
    assert is_exhausted(state)  # calls hit 3/3


def test_exhausted_rounds_end_run_cleanly(tmp_path):
    proj = tmp_path / "proj"
    graph = build_graph(proj, COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    budget = BudgetState(max_model_calls=50, max_research_rounds=5,
                         rounds_used=5)
    result = graph.invoke(make_state(budget), config)
    assert tuple(graph.get_state(config).next) == ()  # reached END
    assert not (proj / "plan" / "research-plan.yaml").exists()  # no council
    assert result["budget"].exhausted()


def test_exhausted_calls_end_run_cleanly(tmp_path):
    proj = tmp_path / "proj"
    graph = build_graph(proj, COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    budget = BudgetState(max_model_calls=50, max_research_rounds=5,
                         calls_used=50)
    result = graph.invoke(make_state(budget), config)
    assert tuple(graph.get_state(config).next) == ()
    assert not (proj / "plan" / "research-plan.yaml").exists()
    assert result["escalate"] is False


def test_fresh_budget_still_escalates(tmp_path):
    proj = tmp_path / "proj"
    graph = build_graph(proj, COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    graph.invoke(make_state(BudgetState()), config)
    assert (proj / "plan" / "research-plan.yaml").is_file()
    assert tuple(graph.get_state(config).next) == ("human_checkpoint",)
