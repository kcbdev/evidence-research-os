"""PBI-053 gate: compiler parity + fail-closed validation.

Parity is BEHAVIORAL (streamed node sequences, all three modes) — edge
inspection via get_graph() proved unreliable in PBI-034. LLM boundary
mocked; stores/graphs real.
"""
import pytest
from pathlib import Path
from app.graph.compile import build_graph_from_methodology
from app.models.evidence import BudgetState, ProjectMeta
from app.models.methodology import Methodology
from app.store.lab_project import LabProjectStore

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"
MODELS = {**COUNCIL, "judge": JUDGE}


def _stage(sid, node, **kw):
    return {"id": sid, "node": node, **kw}


def _methodology(mid, modes, stages):
    return Methodology(
        id=mid, name=mid, description="test", is_default=False,
        compatible_modes=modes,
        workflow={"stages": stages},
        tools={"enabled": []}, prompts={"set": "role-prompts/v1"},
        skills={}, models=dict(MODELS),
        budget_defaults={"max_model_calls": 50,
                         "max_research_rounds": 5})


RESEARCH_STAGES = [
    _stage("trigger_classifier", "trigger_classifier",
           route="route_classifier"),
    _stage("plan", "plan"),
    _stage("independent_first_pass", "independent_first_pass"),
    _stage("evidence_extraction", "evidence_extraction"),
    _stage("conflict_detection", "conflict_detection",
           route="route_conflict"),
    _stage("targeted_research", "targeted_research"),
    _stage("adversarial_review", "adversarial_review"),
    _stage("evidence_adjudication", "evidence_adjudication"),
    _stage("synthesis", "synthesis"),
    _stage("citation_audit", "citation_audit", route="route_audit"),
    _stage("targeted_repair", "targeted_repair"),
    _stage("human_checkpoint", "human_checkpoint", interrupt=True),
    _stage("final_output", "final_output"),
]

BRAINSTORM_STAGES = [
    _stage("trigger_classifier", "trigger_classifier",
           route="route_classifier"),
    _stage("plan", "plan"),
    _stage("independent_first_pass", "independent_first_pass"),
    _stage("novelty_check", "novelty_check"),
    _stage("adversarial_review", "adversarial_review"),
    _stage("evidence_adjudication", "evidence_adjudication"),
    _stage("synthesis", "synthesis"),
    _stage("citation_audit", "citation_audit", route="route_audit"),
    _stage("targeted_repair", "targeted_repair"),
    _stage("human_checkpoint", "human_checkpoint", interrupt=True),
    _stage("final_output", "final_output"),
]

ACADEMIC_STAGES = [
    _stage("trigger_classifier", "trigger_classifier",
           route="route_classifier"),
    _stage("plan", "plan"),
    _stage("independent_first_pass", "independent_first_pass"),
    _stage("evidence_extraction", "evidence_extraction"),
    _stage("conflict_detection", "conflict_detection",
           route="route_conflict"),
    _stage("targeted_research", "targeted_research"),
    _stage("adversarial_review", "adversarial_review"),
    _stage("evidence_adjudication", "evidence_adjudication"),
    _stage("methodology_analysis", "methodology_analysis"),
    _stage("reproducibility_audit", "reproducibility_audit"),
    _stage("synthesis", "synthesis"),
    _stage("citation_audit", "citation_audit", route="route_audit"),
    _stage("targeted_repair", "targeted_repair"),
    _stage("human_checkpoint", "human_checkpoint", interrupt=True),
    _stage("final_output", "final_output"),
]


def _mock(monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    monkeypatch.setattr("app.agents.ideator.call_model_resilient",
                        lambda *a, **k: ("IDEA: x\n", 1))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")


def _seed_into(root, mode="research"):
    store = LabProjectStore(Path(root), "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q",
        created_at="2026-09-05T10:00:00Z", mode=mode,
        council_models=dict(COUNCIL, ideator="m-ide"),
        judge_model=JUDGE))
    return store


def _seed(tmp_path, mode="research"):
    return _seed_into(tmp_path, mode)


def _state(mode="research"):
    return {"lab_project_id": "p", "mode": mode,
            "active_question": "does X improve Y?",
            "budget": BudgetState(), "pending_tasks": [],
            "open_contradictions": [], "escalate": True,
            "audit_passed": False, "needs_human_approval": False,
            "session_id": "s", "first_pass": {}}


def _stream_names(graph, state, thread):
    names = []
    for chunk in graph.stream(
            state, {"configurable": {"thread_id": thread}},
            stream_mode="updates"):
        names.extend(chunk.keys())
    return names


@pytest.mark.parametrize("mode,stages", [
    ("research", RESEARCH_STAGES),
    ("brainstorm", BRAINSTORM_STAGES),
    ("academic", ACADEMIC_STAGES),
])
def test_captured_yaml_matches_inline_topology(tmp_path, monkeypatch,
                                               mode, stages):
    """Capture parity (PBI-054): the committed YAML files carry EXACTLY
    the stage sequences the hardcoded builder had (inline here as the
    witness transcript) — same ids, nodes, routes, interrupts, order.
    Any capture drift fails here, not in production."""
    from app.store.methodology import MethodologyStore
    _mock(monkeypatch)
    captured = MethodologyStore().get_default_for_mode(mode)
    assert [s.id for s in captured.workflow.stages] == \
        [s["id"] for s in stages]
    assert [(s.id, s.node, s.route, s.loop_while, s.loop_target,
             s.interrupt) for s in captured.workflow.stages] == \
        [(s["id"], s["node"], s.get("route"), s.get("loop_while"),
          s.get("loop_target"), s.get("interrupt", False))
         for s in stages]
    # ...and the captured file still streams the full pipeline to pause.
    _seed_into(tmp_path / "new", mode)
    graph = build_graph_from_methodology(captured, tmp_path / "new")
    config = {"configurable": {"thread_id": "t-new"}}
    names = _stream_names(graph, _state(mode), "t-new")
    assert "final_output" not in names  # interrupt stops the stream
    assert tuple(graph.get_state(config).next) == ("human_checkpoint",)


def test_loop_form_compiles_and_loops(tmp_path, monkeypatch):
    _mock(monkeypatch)
    _seed_into(tmp_path / "loop")
    m = _methodology("m-loop", ["research"], [
        _stage("trigger_classifier", "trigger_classifier",
               route="route_classifier"),
        _stage("plan", "plan"),
        _stage("independent_first_pass", "independent_first_pass"),
        _stage("evidence_extraction", "evidence_extraction"),
        _stage("conflict_detection", "conflict_detection",
               loop_while="has_open_contradictions",
               loop_target="targeted_research"),
        _stage("targeted_research", "targeted_research"),
        _stage("adversarial_review", "adversarial_review"),
        _stage("evidence_adjudication", "evidence_adjudication"),
        _stage("synthesis", "synthesis"),
        _stage("citation_audit", "citation_audit",
               loop_while="audit_failed", loop_target="targeted_repair"),
        _stage("targeted_repair", "targeted_repair"),
        _stage("human_checkpoint", "human_checkpoint", interrupt=True),
        _stage("final_output", "final_output"),
    ])
    graph = build_graph_from_methodology(m, tmp_path / "loop")
    config = {"configurable": {"thread_id": "t-loop"}}
    names = _stream_names(graph, _state(), "t-loop")
    # Loop form executes (targeted runs as linear next when the
    # predicate is false) and still pauses at the interrupt.
    assert "targeted_research" in names
    assert "human_checkpoint" not in names  # interrupt: never executes
    assert tuple(graph.get_state(config).next) == ("human_checkpoint",)


def test_unknown_names_fail_loud(tmp_path):
    base = {"id": "m", "name": "m", "description": "d",
            "compatible_modes": ["research"],
            "tools": {"enabled": []}, "prompts": {"set": "x"},
            "skills": {}, "models": dict(MODELS),
            "budget_defaults": {}}

    def _build(stages):
        return build_graph_from_methodology(
            Methodology(**{**base, "workflow": {"stages": stages}}),
            tmp_path)

    with pytest.raises(ValueError, match="unknown node 'nope'"):
        _build([{"id": "a", "node": "nope"}])
    with pytest.raises(ValueError, match="unknown loop_while"):
        _build([{"id": "a", "node": "plan", "loop_while": "nope",
                 "loop_target": "a"}])
    with pytest.raises(ValueError, match="unknown loop_target"):
        _build([{"id": "a", "node": "plan",
                 "loop_while": "has_open_contradictions",
                 "loop_target": "ghost"}])
    with pytest.raises(ValueError, match="unknown route"):
        _build([{"id": "a", "node": "plan", "route": "nope"}])
    with pytest.raises(ValueError, match="mutually exclusive"):
        _build([{"id": "a", "node": "plan", "route": "route_audit",
                 "loop_while": "audit_failed", "loop_target": "a"}])
    with pytest.raises(ValueError, match="no stages"):
        _build([])
    bad_models = dict(COUNCIL)  # no judge key at all
    with pytest.raises(ValueError, match="judge"):
        build_graph_from_methodology(
            Methodology(**{**base, "models": bad_models,
                           "workflow": {"stages": [
                               {"id": "a", "node": "plan"}]}}),
            tmp_path)


def test_unknown_keys_still_rejected(tmp_path):
    """Forward-authored Tier C syntax (and typos) must error, not
    silently pass. custom_roles/loop_condition graduated in
    PBI-058/059 — this now guards the remaining frontier."""
    import pydantic
    with pytest.raises(pydantic.ValidationError):
        _methodology("m", ["research"], [
            {"id": "a", "node": "plan", "teleport": True}])
    with pytest.raises(pydantic.ValidationError):
        Methodology(id="m", name="m", description="d",
                    compatible_modes=["research"],
                    workflow={"stages": [{"id": "a", "node": "plan"}]},
                    tools={"enabled": []}, prompts={"set": "x"},
                    skills={}, models=dict(MODELS),
                    budget_defaults={},
                    custom_nodes=[{"id": "r"}])  # type: ignore[call-arg]


def test_judge_overlap_refused(tmp_path):
    overlap = dict(MODELS)
    overlap["scientist"] = JUDGE
    m = _methodology("m", ["research"], RESEARCH_STAGES)
    m.models = overlap
    with pytest.raises(ValueError, match="overlap"):
        build_graph_from_methodology(m, tmp_path)
