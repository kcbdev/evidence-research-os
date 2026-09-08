"""PBI-006 gate: topology, escalation path, checkpoint pause/resume.

Skeleton honesty: stubs implement no branch logic, so the test seeds
`audit_passed=True` to steer the audit branch (PBI-013 owns the real
decision). Everything else — edges taken, file written, interrupt hit,
resume to END — is executed, not assumed.
"""
from app.graph.build import build_graph
from app.models.evidence import BudgetState

import pytest

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


@pytest.fixture(autouse=True)
def _skeleton_deps(monkeypatch):
    # PBI-011 made council nodes real: skeleton tests mock the LLM
    # boundary and the project meta they read.
    from app.models.evidence import ProjectMeta
    meta = ProjectMeta(id="p", title="t", question="q",
                       created_at="2026-09-05T10:00:00Z",
                       council_models=COUNCIL, judge_model=JUDGE)
    monkeypatch.setattr(
        "app.store.lab_project.LabProjectStore.read_meta", lambda self: meta)
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                          lambda *a, **k: ("", 1))
    # final_output commits decisions/ entries: hermetic git identity
    # (production relies on machine config / GIT_* env per PBI-005).
    for var, val in (("GIT_AUTHOR_NAME", "t"), ("GIT_AUTHOR_EMAIL", "t@e.org"),
                     ("GIT_COMMITTER_NAME", "t"),
                     ("GIT_COMMITTER_EMAIL", "t@e.org")):
        monkeypatch.setenv(var, val)

NODES = [
    "trigger_classifier", "plan", "independent_first_pass",
    "evidence_extraction", "conflict_detection", "targeted_research",
    "adversarial_review", "evidence_adjudication", "synthesis",
    "citation_audit", "targeted_repair", "human_checkpoint",
    "final_output",
]


def make_state(**over):
    state = {
        "lab_project_id": "p", "mode": "research",
        "active_question": "does X improve Y?",
        "budget": BudgetState(), "pending_tasks": [],
        "open_contradictions": [], "escalate": False,
        "audit_passed": True,  # seeded: stubs don't decide branches yet
        "needs_human_approval": False,
        "session_id": "s-test", "first_pass": {},
    }
    state.update(over)
    return state


def test_checkpoint_file_created(tmp_path):
    import sqlite3
    proj = tmp_path / "proj"
    build_graph(proj, COUNCIL, JUDGE)
    assert (proj / "checkpoint.sqlite").is_file()
    # setup() wiring proof: file alone proves nothing (connect() is eager).
    tables = {r[0] for r in sqlite3.connect(str(proj / "checkpoint.sqlite"))
              .execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "checkpoints" in tables and "writes" in tables


def test_all_thirteen_nodes_registered(tmp_path):
    graph = build_graph(tmp_path / "proj", COUNCIL, JUDGE)
    assert set(NODES) <= set(graph.get_graph().nodes)


def test_escalation_path_pauses_before_checkpoint(tmp_path):
    proj = tmp_path / "proj"
    graph = build_graph(proj, COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    graph.invoke(make_state(), config)
    # plan node executed on the escalation branch:
    assert (proj / "plan" / "research-plan.yaml").is_file()
    # execution paused BEFORE human_checkpoint (interrupt_before):
    assert tuple(graph.get_state(config).next) == ("human_checkpoint",)


def test_resume_after_approval_reaches_end(tmp_path):
    proj = tmp_path / "proj"
    graph = build_graph(proj, COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    graph.invoke(make_state(), config)
    graph.invoke(None, config)  # approve + resume
    assert tuple(graph.get_state(config).next) == ()
