"""Methodology compiler (PBI-053, Phase 5 guide Task 41, adapted).

Adaptations to the guide sketch (all spec'd in
specs/phase-5-methodology-registry/spec.md): registry values are
path-taking builders (as-built factory pattern); stages support
`route` (named forward-branch router) alongside `loop_while` because
the real topology's classifier/exhaustion branches are not loop-backs.

Every unknown name fails LOUDLY naming methodology + stage + field —
never a half-built graph. Judge/council overlap is fail-closed, same
rule as run-start. The checkpointer is the same per-project
checkpoint.sqlite the hardcoded builder uses, so compiled graphs are
thread-compatible with existing checkpoints.
"""
import sqlite3
import warnings
from pathlib import Path
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from app.agents.config import validate_model_assignment
from app.graph.generic_node import make_prompt_agent_node
from app.graph.state import LabProjectState
from app.graph.registry import NODE_REGISTRY, CONDITION_REGISTRY
from app.models.methodology import Methodology
from app.tools.dispatch import get_tools_for_names


def build_graph_from_methodology(methodology: Methodology,
                                 lab_project_path: Path):
    mid = methodology.id
    lab_project_path = Path(lab_project_path)
    models = methodology.models
    if "judge" not in models:
        raise ValueError(
            f"methodology {mid}: models must name a judge")
    validate_model_assignment(
        {k: v for k, v in models.items() if k != "judge"},
        models["judge"])
    stages = methodology.workflow.stages
    if not stages:
        raise ValueError(f"methodology {mid}: no stages")
    ids = [s.id for s in stages]
    if len(set(ids)) != len(ids):
        raise ValueError(f"methodology {mid}: duplicate stage ids")
    by_id = {s.id: s for s in stages}

    def _fail(stage_id, field, value):
        raise ValueError(
            f"methodology {mid} stage {stage_id}: "
            f"unknown {field} '{value}'")

    for stage in stages:
        if stage.node not in NODE_REGISTRY and \
                stage.node not in {r.id for r in methodology.custom_roles}:
            _fail(stage.id, "node", stage.node)
        if stage.loop_while is not None:
            if stage.route is not None:
                raise ValueError(
                    f"methodology {mid} stage {stage.id}: loop_while and "
                    "route are mutually exclusive")
            if stage.loop_while not in CONDITION_REGISTRY:
                _fail(stage.id, "loop_while", stage.loop_while)
            if stage.loop_target not in by_id:
                _fail(stage.id, "loop_target", stage.loop_target)
        if stage.route is not None and \
                stage.route not in CONDITION_REGISTRY:
            _fail(stage.id, "route", stage.route)

    lab_project_path.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        str(lab_project_path / "checkpoint.sqlite"),
        check_same_thread=False)
    checkpointer = SqliteSaver(conn)
    checkpointer.setup()

    # Tier A (PBI-058): custom roles resolve FIRST. A custom id may
    # shadow a built-in — explicit author intent, but loud about it.
    custom: dict[str, object] = {}
    for role in methodology.custom_roles:
        if role.id in NODE_REGISTRY:
            warnings.warn(
                f"methodology {mid}: custom role '{role.id}' shadows "
                "a built-in node")
        try:
            tools = get_tools_for_names(role.tools)
        except ValueError as exc:
            raise ValueError(f"methodology {mid} role {role.id}: {exc}")
        custom[role.id] = make_prompt_agent_node(
            role.model_dump(), lab_project_path, tools)

    def _builder(stage):
        if stage.node in custom:
            return lambda _path: custom[stage.node]
        return NODE_REGISTRY[stage.node]

    g = StateGraph(LabProjectState)
    for stage in stages:
        g.add_node(stage.id, _builder(stage)(lab_project_path))

    g.add_edge(START, ids[0])
    for i, stage in enumerate(stages):
        linear = ids[i + 1] if i + 1 < len(ids) else END
        if stage.route is not None:
            router = CONDITION_REGISTRY[stage.route]

            def _where(s, router=router, by_id=by_id):
                target = router(s)
                if target == "END":
                    return END
                if target not in by_id:
                    raise ValueError(
                        f"methodology {mid}: router returned unknown "
                        f"stage '{target}'")
                return target
            g.add_conditional_edges(stage.id, _where)
        elif stage.loop_while is not None:
            cond = CONDITION_REGISTRY[stage.loop_while]
            target = stage.loop_target

            def _loop(s, cond=cond, target=target, nxt=linear):
                return target if cond(s) else nxt
            g.add_conditional_edges(stage.id, _loop)
        else:
            g.add_edge(stage.id, linear)

    interrupts = [s.id for s in stages if s.interrupt]
    return g.compile(checkpointer=checkpointer,
                     interrupt_before=interrupts)
