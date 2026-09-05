"""Graph assembly per guide §2.2. Checkpointer wiring follows the adopted
`langgraph-persistence` skill: per-project SQLite file, thread_id per run.

Connection lifetime: the sqlite3 connection is process-owned (opened here,
`check_same_thread=False` for server use) and lives as long as the compiled
graph. No per-invocation open/close.
"""
import sqlite3
from pathlib import Path
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from app.graph.state import LabProjectState
from app.graph import nodes


def build_graph(lab_project_path: Path):
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
    g.add_node("independent_first_pass", nodes.independent_first_pass)
    g.add_node("evidence_extraction", nodes.evidence_extraction)
    g.add_node("conflict_detection", nodes.conflict_detection)
    g.add_node("targeted_research", nodes.targeted_research)
    g.add_node("adversarial_review", nodes.adversarial_review)
    g.add_node("evidence_adjudication", nodes.evidence_adjudication)
    g.add_node("synthesis", nodes.synthesis)
    g.add_node("citation_audit", nodes.citation_audit)
    g.add_node("targeted_repair", nodes.targeted_repair)
    g.add_node("human_checkpoint", nodes.human_checkpoint)
    g.add_node("final_output", nodes.final_output)

    g.add_edge(START, "trigger_classifier")
    g.add_conditional_edges("trigger_classifier",
                            lambda s: "plan" if s["escalate"] else "final_output")
    g.add_edge("plan", "independent_first_pass")
    g.add_edge("independent_first_pass", "evidence_extraction")
    g.add_edge("evidence_extraction", "conflict_detection")
    g.add_conditional_edges("conflict_detection",
                            lambda s: "targeted_research" if s["open_contradictions"] else "adversarial_review")
    g.add_edge("targeted_research", "conflict_detection")   # loop back
    g.add_edge("adversarial_review", "evidence_adjudication")
    g.add_edge("evidence_adjudication", "synthesis")
    g.add_edge("synthesis", "citation_audit")
    g.add_conditional_edges("citation_audit",
                            lambda s: "human_checkpoint" if s["audit_passed"] else "targeted_repair")
    g.add_edge("targeted_repair", "citation_audit")          # loop back
    g.add_edge("human_checkpoint", "final_output")
    g.add_edge("final_output", END)

    return g.compile(checkpointer=checkpointer,
                     interrupt_before=["human_checkpoint"])
