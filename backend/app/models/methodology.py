"""Methodology schema (PBI-053, Phase 5 guide Task 40).

Stages reference nodes/conditions BY NAME — no code in YAML (the
boundary Phase 5b explicitly revisits). Unknown fields are FORBIDDEN
(fail-closed): Tier B/C keys (`custom_roles`, `loop_condition`) are
rejected by validation until Phase 5b lifts the gate — forward-
authoring them today must error, not silently pass.
"""
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict


class StageSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    node: str                      # must exist in NODE_REGISTRY
    roles: list[str] = []
    loop_while: Optional[str] = None    # CONDITION_REGISTRY name
    loop_target: Optional[str] = None   # another stage id
    # PBI-053 addition beyond the guide sketch: the real topology has
    # FORWARD branches the loop form cannot express (classifier
    # escalate, exhaustion short-circuits). `route` names a router in
    # CONDITION_REGISTRY returning the next stage id (or "END").
    # A stage carries at most one of loop_while / route (both set 422s
    # at compile).
    route: Optional[str] = None
    interrupt: bool = False


class WorkflowSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stages: list[StageSpec]


class ToolsSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: list[str]


class PromptsSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    set: str
    overrides: dict[str, str] = {}


class BudgetDefaults(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_model_calls: int = 50
    max_research_rounds: int = 5


class CustomRoleSpec(BaseModel):
    """Tier A (PBI-058): a new agent role as pure YAML — system prompt
    + tool list + model, no code. output_schema is a best-effort
    validation hint ("module:Class"), not a second type system."""
    model_config = ConfigDict(extra="forbid")

    id: str
    system_prompt: str
    tools: list[str] = []
    model: str
    output_schema: Optional[str] = None


class Methodology(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str
    is_default: bool = False
    compatible_modes: list[Literal["research", "brainstorm", "academic"]]
    workflow: WorkflowSpec
    tools: ToolsSpec
    prompts: PromptsSpec
    skills: dict[str, list[str]]
    models: dict[str, str]
    budget_defaults: BudgetDefaults
    custom_roles: list[CustomRoleSpec] = []  # Tier A (PBI-058)
