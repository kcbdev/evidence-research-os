"""LangGraph state schema (spec §6.1, guide §2.1)."""
from typing import Literal
from typing_extensions import TypedDict
from app.models.evidence import Task, BudgetState


class LabProjectState(TypedDict):
    lab_project_id: str
    mode: Literal["research", "brainstorm"]
    active_question: str
    budget: BudgetState
    pending_tasks: list[Task]
    open_contradictions: list[str]
    escalate: bool           # set by trigger_classifier
    audit_passed: bool
    needs_human_approval: bool
