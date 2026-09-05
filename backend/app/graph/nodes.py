"""Graph nodes. PBI-006 implements trigger_classifier + plan; the other 11
are named pass-through stubs (visible in LangGraph traces) arriving in
PBI-011 (council loop), PBI-012 (review/adjudication/synthesis), and
PBI-013 (audit/repair/checkpoint/output)."""
from pathlib import Path
import yaml
from app.graph.state import LabProjectState


def trigger_classifier(state: LabProjectState) -> LabProjectState:
    # Cheap single-pass gate (iMAD-style). TODO: real heuristic — skip the
    # full council for answered/simple questions or tight budgets.
    state["escalate"] = True
    return state


def make_plan(lab_project_path: Path):
    """Plan node bound to a project dir. PBI-008 wires the Scientist here;
    until then it records run intent as a placeholder (a run artifact like
    output/report.md — not an evidence object type, so the store doesn't
    own it)."""

    def plan(state: LabProjectState) -> LabProjectState:
        plan_dir = Path(lab_project_path) / "plan"
        plan_dir.mkdir(parents=True, exist_ok=True)
        (plan_dir / "research-plan.yaml").write_text(
            yaml.safe_dump({
                "question": state["active_question"],
                "mode": state["mode"],
                "status": "stub",
            })
        )
        return state

    return plan


def independent_first_pass(state: LabProjectState) -> LabProjectState:
    return state  # PBI-011


def evidence_extraction(state: LabProjectState) -> LabProjectState:
    return state  # PBI-011


def conflict_detection(state: LabProjectState) -> LabProjectState:
    return state  # PBI-011


def targeted_research(state: LabProjectState) -> LabProjectState:
    return state  # PBI-011


def adversarial_review(state: LabProjectState) -> LabProjectState:
    return state  # PBI-012


def evidence_adjudication(state: LabProjectState) -> LabProjectState:
    return state  # PBI-012


def synthesis(state: LabProjectState) -> LabProjectState:
    return state  # PBI-012


def citation_audit(state: LabProjectState) -> LabProjectState:
    return state  # PBI-013


def targeted_repair(state: LabProjectState) -> LabProjectState:
    return state  # PBI-013


def human_checkpoint(state: LabProjectState) -> LabProjectState:
    return state  # PBI-013 (sets needs_human_approval there)


def final_output(state: LabProjectState) -> LabProjectState:
    return state  # PBI-013
