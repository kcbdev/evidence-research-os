"""Builder library schemas (PBI-063).

Skills, Prompts (+version history), and Custom Role library entries
authored once in the builder libraries UI and referenced from many
methodologies — the composition-over-duplication contract from the
nocode-methodology-builder spec. ToolInfo/ConditionField are response
shapes for the read-only registry endpoints (derived from
app.tools.dispatch / app.graph.state, never hand-maintained lists
that can drift — the field/type pairs mirror LabProjectState).
"""
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class Skill(BaseModel):
    """A reusable markdown procedure (Memory-architecture "procedural
    memory"). Body is the literal Skill file content."""
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str = ""
    body: str = Field(min_length=1)


class PromptVersion(BaseModel):
    """One frozen prompt text. Appended on every save — prompt
    iteration is exactly the change you want to undo."""
    model_config = ConfigDict(extra="forbid")

    version: int = Field(gt=0)
    text: str
    saved_at: str = ""


class Prompt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str = ""
    text: str = Field(min_length=1)
    version: int = Field(default=1, gt=0)
    updated_at: str = ""
    history: list[PromptVersion] = []


class LibraryRole(BaseModel):
    """A Custom Role library entry. `model == ""` means inherit from
    Settings → Models (the builder exposes this as the default with an
    override switch — the empty string is the inherit marker, not a
    missing value). `prompt_ref` is provenance only (which Prompts
    entry the text came from); `system_prompt` is the executed text.
    `skills` are Skill ids, assigned from this side only (the Skills
    editor shows them read-only — one source of truth)."""
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str = ""
    system_prompt: str = Field(min_length=1)
    prompt_ref: Optional[str] = None
    tools: list[str] = []
    model: str = ""
    output_schema: Optional[str] = None
    skills: list[str] = []


class ToolInfo(BaseModel):
    """One row of the read-only Tools registry. `source` is honest:
    these are backend-local adapters (app.tools.dispatch), not MCP
    servers — claiming an MCP layer that does not exist would be the
    same lie class Phase 5b bans for Tier C sandboxing."""
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    source: str


class ConditionField(BaseModel):
    """One Condition-Builder field dropdown row. `count` = list-valued
    state field (operators >, <, ==, !=); `bool` = boolean state field
    (is true / is false). Mirrors LabProjectState + CONDITION_REGISTRY
    usage — adding a state field the conditions can read means adding
    a row here."""
    model_config = ConfigDict(extra="forbid")

    field: str
    type: Literal["count", "bool"]


class CustomNodeInfo(BaseModel):
    """One row of the discovered-custom-nodes listing (PBI-067). Parsed
    with `ast` — never imported: a broken file must not break the
    listing (import-time failures stay loud at build/validate time).
    `node_id` is None when the file defines none; `load_error` names
    files that don't even parse. `description` is the docstring's first
    paragraph (summary, not the whole manual)."""
    model_config = ConfigDict(extra="forbid")

    node_id: Optional[str]
    filename: str
    description: str
    load_error: Optional[str] = None
