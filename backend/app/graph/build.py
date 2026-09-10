"""Graph assembly per guide §2.2. Checkpointer wiring follows the adopted
`langgraph-persistence` skill: per-project SQLite file, thread_id per run.
The single pause mechanism (`interrupt_before=["human_checkpoint"]`)
follows the adopted `langgraph-human-in-the-loop` skill — no parallel
pause machinery exists or may be added.

Connection lifetime: the sqlite3 connection is process-owned (opened here,
`check_same_thread=False` for server use) and lives as long as the compiled
graph. No per-invocation open/close.
"""
import sqlite3
from pathlib import Path
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from app.agents.config import validate_model_assignment
from app.graph.budget import is_exhausted
from app.graph.state import LabProjectState
from app.graph import nodes


def build_graph(lab_project_path: Path,
                council_models: dict[str, str],
                judge_model: str,
                mode: str = "research"):
    # Hard startup check FIRST: nothing (no dirs, no sqlite) is created
    # when the assignment is invalid. Params are REQUIRED (fail-closed):
    # every construction site — tests, shells, PBI-014 run start —
    # supplies the project.yaml model assignment explicitly.
    validate_model_assignment(council_models, judge_model)
    if mode not in ("research", "brainstorm", "academic"):
        raise ValueError(f"unknown mode: {mode!r}")
    if mode == "brainstorm" and "ideator" not in council_models:
        raise ValueError(
            "brainstorm mode needs an 'ideator' model in council_models")
    lab_project_path = Path(lab_project_path)
    lab_project_path.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        str(lab_project_path / "checkpoint.sqlite"), check_same_thread=False
    )
    checkpointer = SqliteSaver(conn)
    checkpointer.setup()

    g = StateGraph(LabProjectState)
    g.add_node("trigger_classifier", nodes.trigger_classifier)
    g.add_node("plan", nodes.make_plan(lab_project_path))
    g.add_node("independent_first_pass",
                 nodes.make_independent_first_pass(lab_project_path))
    g.add_node("evidence_extraction",
                 nodes.make_evidence_extraction(lab_project_path))
    g.add_node("conflict_detection",
                 nodes.make_conflict_detection(lab_project_path))
    g.add_node("targeted_research",
                 nodes.make_targeted_research(lab_project_path))
    g.add_node("adversarial_review",
                 nodes.make_adversarial_review(lab_project_path))
    g.add_node("evidence_adjudication",
                 nodes.make_evidence_adjudication(lab_project_path))
    g.add_node("methodology_analysis",
                 nodes.make_methodology_analysis(lab_project_path))
    g.add_node("reproducibility_audit",
                 nodes.make_reproducibility_audit(lab_project_path))
    g.add_node("synthesis", nodes.make_synthesis(lab_project_path))
    g.add_node("citation_audit",
                 nodes.make_citation_audit(lab_project_path))
    g.add_node("targeted_repair",
                 nodes.make_targeted_repair(lab_project_path))
    g.add_node("human_checkpoint", nodes.human_checkpoint)
    g.add_node("final_output", nodes.make_final_output(lab_project_path))

    g.add_edge(START, "trigger_classifier")
    g.add_conditional_edges("trigger_classifier",
                            lambda s: "plan" if s["escalate"] else "final_output")
    g.add_edge("plan", "independent_first_pass")
    if mode == "brainstorm":
        # PBI-034: divergence branch — novelty replaces conflict; the
        # shared tail (review → adjudication → synthesis → audit →
        # checkpoint → output) is empty-safe on zero claims. Research-only
        # nodes stay registered but intentionally disconnected here.
        g.add_node("novelty_check", nodes.make_novelty_check(lab_project_path))
        g.add_edge("independent_first_pass", "novelty_check")
        g.add_edge("novelty_check", "adversarial_review")
    else:
        g.add_edge("independent_first_pass", "evidence_extraction")
        g.add_edge("evidence_extraction", "conflict_detection")
    # Topology delta vs guide §2.2 (accepted PBI-011, owns the PBI-007
    # mid-loop stop): an exhausted budget short-circuits to final_output
    # instead of looping or spending review calls it cannot afford.
    def _after_conflict(s):
        if is_exhausted(s):
            return "final_output"
        return "targeted_research" if s["open_contradictions"] else "adversarial_review"
    g.add_conditional_edges("conflict_detection", _after_conflict)
    g.add_edge("targeted_research", "conflict_detection")   # loop back
    g.add_edge("adversarial_review", "evidence_adjudication")
    if mode == "academic":
        # PBI-048: publication-grade segment — methodology + repro
        # between adjudication and synthesis. Research/brainstorm skip
        # it (cost); the nodes stay registered but disconnected there.
        g.add_edge("evidence_adjudication", "methodology_analysis")
        g.add_edge("methodology_analysis", "reproducibility_audit")
        g.add_edge("reproducibility_audit", "synthesis")
    else:
        g.add_edge("evidence_adjudication", "synthesis")
    g.add_edge("synthesis", "citation_audit")
    # Same accepted pattern as the conflict branch (PBI-013 owns the
    # PBI-007 stop): if the budget already exhausted upstream (review /
    # adjudication spend calls), the audit outcome is moot — end at
    # final_output instead of repairing a run that cannot continue.
    # (Audit/repair nodes themselves consume nothing, so the predicate
    # cannot flip mid-repair; repair terminates by determinism.)
    def _after_audit(s):
        if is_exhausted(s):
            return "final_output"
        return ("human_checkpoint" if s["audit_passed"]
                else "targeted_repair")
    g.add_conditional_edges("citation_audit", _after_audit)
    g.add_edge("targeted_repair", "citation_audit")          # loop back
    g.add_edge("human_checkpoint", "final_output")
    g.add_edge("final_output", END)

    return g.compile(checkpointer=checkpointer,
                     interrupt_before=["human_checkpoint"])
