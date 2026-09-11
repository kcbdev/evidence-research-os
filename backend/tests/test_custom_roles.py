"""PBI-058 gate: Tier A custom roles.

LLM boundary mocked; compiler/store/graph real. No custom_nodes files,
no engine changes — everything authored as data.
"""
import pytest
from app.graph.compile import build_graph_from_methodology
from app.models.evidence import BudgetState, ProjectMeta
from app.models.methodology import Methodology
from app.store.lab_project import LabProjectStore
from app.tools.dispatch import get_tools_for_names

MODELS = {"scientist": "m-sci", "investigator": "m-inv",
          "skeptic": "m-ske", "judge": "m-judge"}
# Project council never carries a "judge" key (real project.yaml
# shape) — strip it when seeding project meta.
COUNCIL = {k: v for k, v in MODELS.items() if k != "judge"}


def _methodology(stages, roles):
    return Methodology(
        id="m-tier-a", name="n", description="d", is_default=False,
        compatible_modes=["research"], workflow={"stages": stages},
        tools={"enabled": []}, prompts={"set": "x"}, skills={},
        models=dict(MODELS),
        budget_defaults={"max_model_calls": 50,
                         "max_research_rounds": 5},
        custom_roles=roles)


def _red_team():
    return {"id": "red_team_reviewer",
            "system_prompt": "Review claims for commercial viability "
                             "objections a skeptical investor would raise.",
            "tools": ["grep_project"], "model": "m-ske"}


def _seed(tmp_path, monkeypatch):
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q",
        created_at="2026-09-05T10:00:00Z",
        council_models=dict(COUNCIL), judge_model="m-judge"))
    return store


def _state(**over):
    state = {"lab_project_id": "p", "mode": "research",
             "active_question": "is X viable?",
             "budget": BudgetState(), "pending_tasks": [],
             "open_contradictions": [], "escalate": True,
             "audit_passed": False, "needs_human_approval": False,
             "session_id": "s", "first_pass": {}}
    state.update(over)
    return state


def _stages():
    return [
        {"id": "trigger_classifier", "node": "trigger_classifier",
         "route": "route_classifier"},
        {"id": "plan", "node": "plan"},
        {"id": "review", "node": "red_team_reviewer"},
        {"id": "final_output", "node": "final_output"},
    ]


def test_yaml_only_role_executes(tmp_path, monkeypatch):
    _seed(tmp_path, monkeypatch)
    monkeypatch.setattr("app.graph.generic_node.call_model_resilient",
                        lambda *a, **k: ("FINAL: commercially dubious", 1))
    graph = build_graph_from_methodology(
        _methodology(_stages(), [_red_team()]), tmp_path)
    names = []
    for chunk in graph.stream(
            _state(), {"configurable": {"thread_id": "t"}},
            stream_mode="updates"):
        names.extend(chunk.keys())
    assert "review" in names
    out = graph.get_state({"configurable": {"thread_id": "t"}})
    assert out.values["first_pass"]["red_team_reviewer"] == \
        "commercially dubious"
    assert out.values["budget"].calls_used == 1  # charged like built-ins
    assert (tmp_path / "p" / "debates" / "red_team_reviewer.md").is_file()


def test_tool_loop_calls_and_charges(tmp_path, monkeypatch):
    store = _seed(tmp_path, monkeypatch)
    from app.models.evidence import Claim
    store.write_claim(Claim(id="C-1", statement="microbe widget"))
    script = [
        "TOOL: grep_project | {\"pattern\": \"microbe\"}",
        "FINAL: found it",
    ]
    calls = {"n": 0}

    def _fake(model, system, user, **k):
        calls["n"] += 1
        return script[min(calls["n"] - 1, 1)], 1
    monkeypatch.setattr("app.graph.generic_node.call_model_resilient",
                        _fake)
    graph = build_graph_from_methodology(
        _methodology(_stages(), [_red_team()]), tmp_path)
    for _ in graph.stream(_state(),
                          {"configurable": {"thread_id": "t2"}},
                          stream_mode="updates"):
        pass
    out = graph.get_state({"configurable": {"thread_id": "t2"}})
    assert calls["n"] == 2  # tool round + final round
    assert out.values["budget"].calls_used == 2
    assert out.values["first_pass"]["red_team_reviewer"] == "found it"
    transcript = (tmp_path / "p" / "debates" / "red_team_reviewer.md"
                  ).read_text(encoding="utf-8")
    assert "TOOL grep_project RESULT" in transcript
    assert "C-1" in transcript  # tool output fed back in


def test_unknown_tool_fails_naming_it(tmp_path):
    role = dict(_red_team(), tools=["time_machine"])
    with pytest.raises(ValueError, match="time_machine"):
        build_graph_from_methodology(
            _methodology(_stages(), [role]), tmp_path)


def test_shadow_warns(tmp_path):
    role = {"id": "plan", "system_prompt": "x", "tools": [],
            "model": "m-sci"}
    stages = [{"id": "a", "node": "plan"},
              {"id": "b", "node": "final_output"}]
    with pytest.warns(UserWarning, match="shadows"):
        build_graph_from_methodology(
            _methodology(stages, [role]), tmp_path)


def test_dispatch_registry_only_existing_tools():
    tools = get_tools_for_names(["grep_project", "fetch_url",
                                 "keyword_search", "semantic_search",
                                 "retrieve_evidence", "store_source"])
    assert set(tools) == {"grep_project", "fetch_url", "keyword_search",
                          "semantic_search", "retrieve_evidence",
                          "store_source"}
    with pytest.raises(ValueError, match="search_web"):
        get_tools_for_names(["search_web"])  # doesn't exist: not offered


def _witness_state(**over):
    state = {"lab_project_id": "p", "mode": "research",
             "active_question": "is X viable?",
             "budget": BudgetState(), "pending_tasks": [],
             "open_contradictions": [], "escalate": True,
             "audit_passed": False, "needs_human_approval": False,
             "session_id": "s-w", "first_pass": {}}
    state.update(over)
    return state


@pytest.mark.parametrize("mid,stage", [
    ("witness-tier-ab-v1", "red_team_review"),
    ("witness-tier-c-v1", "experiment_scoring"),
])
def test_witness_files_compile_and_execute(tmp_path, monkeypatch, mid,
                                           stage):
    """PBI-061 pre-proof (mocked): the committed witness methodologies
    compile and run their custom stages to pause. The LIVE witness
    (real models, budget/cache parity) stays human — needs a key."""
    from app.store.methodology import MethodologyStore
    _seed(tmp_path, monkeypatch)
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    monkeypatch.setattr("app.graph.generic_node.call_model_resilient",
                        lambda *a, **k: ("FINAL: witness ok", 1))
    m = MethodologyStore().get(mid)
    graph = build_graph_from_methodology(m, tmp_path)
    config = {"configurable": {"thread_id": f"t-{mid}"}}
    names = []
    for chunk in graph.stream(_witness_state(), config,
                              stream_mode="updates"):
        names.extend(chunk.keys())
    assert stage in names
    assert tuple(graph.get_state(config).next) == ("human_checkpoint",)
