"""PBI-060 gate: Tier C custom-node discovery.

Discovery is unit-tested against tmp dirs (never the shipped
custom_nodes/); the shipped example executes end to end in a compiled
graph. Broken files fail loud with filename + reason.
"""
import pytest
from app.graph.compile import build_graph_from_methodology
from app.graph.custom_nodes import adapt_run, discover_custom_nodes
from app.models.evidence import BudgetState, Idea, ProjectMeta, ProposedExperiment
from app.models.methodology import Methodology
from app.store.lab_project import LabProjectStore

MODELS = {"scientist": "m-sci", "investigator": "m-inv",
          "skeptic": "m-ske", "judge": "m-judge"}


def _methodology(stages):
    return Methodology(
        id="m-tier-c", name="n", description="d", is_default=False,
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


def _write(directory, name, body):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_text(body, encoding="utf-8")


def test_missing_dir_discovers_nothing(tmp_path):
    assert discover_custom_nodes(tmp_path / "absent") == {}


def test_broken_file_fails_with_filename(tmp_path):
    _write(tmp_path / "cn", "boom.py", "this is not python (((")
    with pytest.raises(ValueError, match="boom.py"):
        discover_custom_nodes(tmp_path / "cn")


def test_missing_node_id_or_run_fail_loud(tmp_path):
    _write(tmp_path / "cn1", "noid.py", "X = 1\n")
    with pytest.raises(ValueError, match="noid.py"):
        discover_custom_nodes(tmp_path / "cn1")
    _write(tmp_path / "cn2", "norun.py", "NODE_ID = 'x'\n")
    with pytest.raises(ValueError, match="norun.py"):
        discover_custom_nodes(tmp_path / "cn2")


def test_duplicate_ids_rejected(tmp_path):
    _write(tmp_path / "cn", "a.py", "NODE_ID = 'dup'\ndef run(s): return s\n")
    _write(tmp_path / "cn", "b.py", "NODE_ID = 'dup'\ndef run(s): return s\n")
    with pytest.raises(ValueError, match="a.py.*b.py|b.py.*a.py"):
        discover_custom_nodes(tmp_path / "cn")


def test_underscore_files_skipped(tmp_path):
    _write(tmp_path / "cn", "_helper.py", "raise RuntimeError('must not load')\n")
    assert discover_custom_nodes(tmp_path / "cn") == {}


def test_adapt_supports_both_arities(tmp_path):
    one = adapt_run(lambda state: {"a": 1}, tmp_path)
    assert one({}) == {"a": 1}
    two = adapt_run(lambda state, path: {"p": str(path)}, tmp_path)
    assert two({}) == {"p": str(tmp_path)}


def test_shipped_example_executes(tmp_path, monkeypatch):
    from app.graph.custom_nodes import CUSTOM_NODES_DIR
    assert CUSTOM_NODES_DIR.is_dir()  # shipped with the repo
    store = _seed(tmp_path, monkeypatch)
    store.write_idea(Idea(
        id="I-001", statement="microbe angle",
        proposed_experiment=ProposedExperiment(
            hypothesis="h", falsification_condition="f",
            feasibility="high")))
    m = _methodology([
        {"id": "trigger_classifier", "node": "trigger_classifier",
         "route": "route_classifier"},
        {"id": "plan", "node": "plan"},
        {"id": "score", "node": "experiment_scorer"},
        {"id": "final_output", "node": "final_output"},
    ])
    graph = build_graph_from_methodology(m, tmp_path)
    names = []
    for chunk in graph.stream(
            _state(), {"configurable": {"thread_id": "t"}},
            stream_mode="updates"):
        names.extend(chunk.keys())
    assert "score" in names
    text = (tmp_path / "p" / "debates" / "experiment_scores.md"
            ).read_text(encoding="utf-8")
    assert "I-001" in text
