"""LangGraph state schema (spec Scope orchestration contract, guide §2.1)."""
from typing import Literal, NotRequired, TypedDict
from app.models.evidence import Task, BudgetState


class LabProjectState(TypedDict):
    lab_project_id: str
    mode: Literal["research", "brainstorm", "academic"]
    active_question: str
    budget: BudgetState
    pending_tasks: list[Task]
    open_contradictions: list[str]
    escalate: bool           # set by trigger_classifier
    audit_passed: bool
    needs_human_approval: bool
    session_id: str          # PBI-011: run session, threaded to cached_*
    first_pass: dict[str, str]  # PBI-011: role -> raw finding text
    # PBI-056: methodology-merged models frozen at start ({council,
    # judge}); nodes prefer this over project.yaml. Absent in ad-hoc
    # states (unit-called nodes fall back to project.yaml).
    models: NotRequired[dict]
