"""PBI-034 gate: brainstorm mode executes end to end.

LLM boundary mocked (call_model_resilient, role-aware); graph/store/threads
are real. Polling loops carry deadlines. Research-path regression is owned
by the existing suite — this file asserts brainstorm behavior plus the
mode-branch topology split.
"""
import time
import pytest
from fastapi.testclient import TestClient
from app.agents.ideator import parse_idea
from app.agents.prompts import get_skeptic_rubric
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache, get_graph
from app.graph.nodes import _parse_novelty
from app.main import create_app
from app.models.evidence import BudgetState
from app.store.lab_project import LabProjectStore
from app.store.methodology import MethodologyStore
from tests.helpers import default_graph

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv",
           "skeptic": "m-ske", "ideator": "m-ide"}
JUDGE = "m-judge"

IDEA_TEXT = """IDEA: studied microbes explain the anomaly
HYPOTHESIS: effect X comes from microbe Y
FALSIFICATION: sterile replication shows no effect
FEASIBILITY: high
"""

SKEPTIC_BRAINSTORM_RESPONSE = """The idea is novel with a clear falsification condition. The experiment is well-designed: sterile replication would definitively test the hypothesis. Feasibility is high as the technique is standard."""


def _mock_llm(model_id, system, user, **k):
    if "Ideator" in system:
        return IDEA_TEXT, 1
    if "Candidate idea:" in user:
        return "VERDICT: NOVEL\nAGAINST: none", 1
    if "IDEAS for novelty" in user or "Review these IDEAS" in user:
        return SKEPTIC_BRAINSTORM_RESPONSE, 1
    return "", 1


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient", _mock_llm)
    monkeypatch.setattr("app.agents.ideator.call_model_resilient", _mock_llm)
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    runs_mod._runs.clear()
    with TestClient(create_app(tmp_path)) as client:
        yield client
    clear_graph_cache()
    runs_mod._runs.clear()


def _create(client, **over):
    payload = {"title": "T", "question": "q",
               "council_models": dict(COUNCIL), "judge_model": JUDGE}
    payload.update(over)
    resp = client.post("/api/v1/lab-projects", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _wait_for(client, pid, rid, want, deadline=30.0):
    end = time.time() + deadline
    while time.time() < end:
        status = client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}").json()
        if status["status"] in want:
            return status
        time.sleep(0.2)
    raise AssertionError(f"run {rid} never reached {want}")


# --- unit: parsing ---

def test_parse_idea_valid_and_degraded():
    idea = parse_idea(IDEA_TEXT)
    assert idea["statement"].startswith("studied microbes")
    assert idea["falsification_condition"].startswith("sterile")
    assert idea["feasibility"] == "high"
    assert parse_idea("IDEA: ...\n") is None  # placeholder, not a finding
    assert parse_idea("nothing structured here") is None
    bad_tag = parse_idea(IDEA_TEXT.replace("high", "extreme"))
    assert bad_tag["feasibility"] == "medium"  # bad tag voids tag only


def test_parse_novelty_valid_and_garbage():
    assert _parse_novelty("VERDICT: ADJACENT\nAGAINST: I-001, I-002") == \
        ("adjacent", ["I-001", "I-002"])
    assert _parse_novelty("VERDICT: none") == ("novel", [])
    assert _parse_novelty("free prose, no verdict") == ("novel", [])


# --- topology split (behavioral: streamed node order) ---

def _streamed_nodes(tmp_path, mode, monkeypatch):
    from app.models.evidence import ProjectMeta
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    monkeypatch.setattr("app.agents.ideator.call_model_resilient",
                        lambda *a, **k: (IDEA_TEXT, 1))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    root = tmp_path / mode
    store = LabProjectStore(root, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q",
        created_at="2026-09-05T10:00:00Z",
        council_models=dict(COUNCIL), judge_model=JUDGE))
    graph = default_graph(root, mode, COUNCIL, JUDGE)
    state = {"lab_project_id": "p", "mode": mode,
             "active_question": "does X improve Y?",
             "budget": BudgetState(),
             "pending_tasks": [], "open_contradictions": [],
             "escalate": False, "audit_passed": False,
             "needs_human_approval": False, "session_id": "s",
             "first_pass": {}}
    names = []
    for chunk in graph.stream(
            state, {"configurable": {"thread_id": "t"}},
            stream_mode="updates"):
        names.extend(chunk.keys())
    return names


def test_topology_splits_on_mode(tmp_path, monkeypatch):
    brain = _streamed_nodes(tmp_path, "brainstorm", monkeypatch)
    assert "novelty_check" in brain
    assert "evidence_extraction" not in brain
    assert "conflict_detection" not in brain  # wrong rubric for the job


def test_research_topology_unchanged(tmp_path, monkeypatch):
    research = _streamed_nodes(tmp_path, "research", monkeypatch)
    assert "evidence_extraction" in research
    assert "conflict_detection" in research
    assert "novelty_check" not in research


def test_resolution_rejects_bad_mode_and_missing_ideator(tmp_path):
    # Fail-closed checks moved with the cutover: unknown modes have no
    # default methodology; a methodology missing ideator EVERYWHERE
    # (file + overrides) still refuses brainstorm. But a project that
    # merely omits ideator now inherits the methodology's (precedence).
    from app.store.methodology import MethodologyStore as MS
    with pytest.raises(ValueError, match="no default methodology"):
        MS().get_default_for_mode("poetry")
    brain = MS().get_default_for_mode("brainstorm")
    no_ide = {k: v for k, v in COUNCIL.items() if k != "ideator"}
    try:
        graph = get_graph(tmp_path, "p", "brainstorm", brain, no_ide,
                          JUDGE)  # fallback supplies ideator
        assert graph is not None
        stripped = brain.model_copy(deep=True)
        stripped.models = {k: v for k, v in stripped.models.items()
                           if k != "ideator"}
        with pytest.raises(ValueError, match="ideator"):
            get_graph(tmp_path, "p", "brainstorm", stripped, no_ide,
                      JUDGE)
    finally:
        clear_graph_cache()


def test_judge_overlapping_ideator_refused(tmp_path):
    # The ideator is a fourth council chair: judge == ideator value is
    # self-preference bias, refused by the same fail-closed check.
    overlap = dict(COUNCIL)
    brain = MethodologyStore().get_default_for_mode("brainstorm")
    try:
        with pytest.raises(ValueError, match="overlap"):
            get_graph(tmp_path, "p", "brainstorm", brain, overlap,
                      overlap["ideator"])
    finally:
        clear_graph_cache()


def test_novelty_node_writes_verdicts(tmp_path, monkeypatch):
    from app.graph.nodes import make_novelty_check
    from app.models.evidence import BudgetState, Idea, NoveltyCheck, ProjectMeta
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: (
                            "VERDICT: DUPLICATE\nAGAINST: I-001", 1))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    root = tmp_path / "nov"
    store = LabProjectStore(root, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q",
        created_at="2026-09-05T10:00:00Z",
        council_models=dict(COUNCIL), judge_model=JUDGE))
    store.write_idea(Idea(id="I-001", statement="prior angle",
                        novelty_check=NoveltyCheck(status="novel",
                                                   against=[])))
    store.write_idea(Idea(id="I-002", statement="restated prior angle"))
    state = {"lab_project_id": "p", "mode": "brainstorm",
             "budget": BudgetState()}
    out = make_novelty_check(root)(state)
    dup = store.read_idea("I-002")
    assert dup.novelty_check.status == "duplicate"
    assert dup.novelty_check.against == ["I-001"]
    assert out["budget"].calls_used == 1  # one verdict call, charged


def test_idea_without_falsification_skipped_but_charged(tmp_path,
                                                        monkeypatch):
    from app.graph.nodes import _brainstorm_pass
    from app.models.evidence import BudgetState, ProjectMeta
    monkeypatch.setattr(
        "app.agents.ideator.call_model_resilient",
        lambda *a, **k: ("IDEA: a wish with no test\nFEASIBILITY: high", 1))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    root = tmp_path / "wish"
    store = LabProjectStore(root, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q",
        created_at="2026-09-05T10:00:00Z",
        council_models=dict(COUNCIL), judge_model=JUDGE))
    state = {"lab_project_id": "p", "mode": "brainstorm",
             "active_question": "q", "budget": BudgetState(),
             "session_id": "s"}
    out = _brainstorm_pass(root, state)
    assert store.list_ideas() == []  # no falsification, no hypothesis
    assert out["budget"].calls_used == 5  # ...but every attempt charged


# --- API: validation ---

def test_start_run_rejects_unknown_mode(client):
    pid = _create(client)
    resp = client.post(f"/api/v1/lab-projects/{pid}/runs",
                       json={"mode": "poetry"})
    assert resp.status_code == 422


def test_brainstorm_without_ideator_model_uses_fallback(client):
    # Cutover precedence: a project omitting ideator inherits the
    # methodology's — the run starts instead of 400ing (PBI-034's 400
    # applied pre-methodology, when no fallback existed).
    no_ide = {k: v for k, v in COUNCIL.items() if k != "ideator"}
    pid = _create(client, council_models=no_ide)
    resp = client.post(f"/api/v1/lab-projects/{pid}/runs",
                       json={"mode": "brainstorm"})
    assert resp.status_code == 200


# --- API: full brainstorm lifecycle ---

def test_brainstorm_run_writes_ideas_only(client, tmp_path):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={"mode": "brainstorm"}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    store = LabProjectStore(tmp_path, pid)
    ideas = store.list_ideas()
    assert len(ideas) >= 1
    assert all(i.novelty_check is not None for i in ideas)
    assert all(i.novelty_check.status == "novel" for i in ideas)
    assert all(i.proposed_experiment is not None for i in ideas)
    assert all(i.proposed_experiment.falsification_condition for i in ideas)
    # Divergence only: the research artifact types stay empty.
    assert store.list_claims() == []
    assert store.list_evidence() == []
    assert store.list_sources() == []
    # ...and the paused run still approves through to done:
    client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                json={"decision": "approve"})
    final = _wait_for(client, pid, rid, {"done"})
    assert final["needs_approval"] is False


def test_get_skeptic_rubric():
    assert get_skeptic_rubric("research") == "skeptic"
    assert get_skeptic_rubric("brainstorm") == "skeptic-brainstorm"


def test_brainstorm_skeptic_rubric_file_exists():
    from pathlib import Path
    p = Path(__file__).parents[2] / "backend/app/agents/prompts/skeptic-brainstorm.md"
    assert p.is_file()
    text = p.read_text(encoding="utf-8")
    assert "IDEA, not a claim" in text
    assert "novel" in text
    assert "falsif" in text


def test_restart_preserves_brainstorm_mode(client, tmp_path):
    from app.api.runs import rehydrate_runs
    # Project default is research; the run overrides to brainstorm —
    # after a simulated restart the approve must recompile brainstorm,
    # not the project default.
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={"mode": "brainstorm"}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    runs_mod._runs.clear()
    clear_graph_cache()
    assert rehydrate_runs(tmp_path) >= 1
    revived = client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}").json()
    assert revived["mode"] == "brainstorm"
    client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                json={"decision": "approve"})
    assert _wait_for(client, pid, rid, {"done"})["status"] == "done"
