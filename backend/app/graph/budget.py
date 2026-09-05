"""Budget enforcement (spec §10, plan task 8).

Model: limits are read from `project.yaml` at run start (PBI-014 seeds
them into the initial state); every model-calling node consumes via
`consume_calls`, `targeted_research` consumes via `consume_round`
(PBI-011/012 wire those calls, PBI-011/013 own the mid-loop stop
tests); `trigger_classifier` refuses escalation on an exhausted budget
so the run ends at `final_output` instead of erroring mid-call.
Exhaustion is observable in the final state itself
(`calls_used >= max_model_calls or rounds_used >= max_research_rounds`)
— no extra status channel needed.

Out of MVP scope here: `max_sources` / `max_sources_per_claim`
(spec §10) — owned by PBI-011 (investigator dispatch volume).
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.graph.state import LabProjectState


def is_exhausted(state: LabProjectState) -> bool:
    return state["budget"].exhausted()


def consume_calls(state: LabProjectState, n: int = 1) -> LabProjectState:
    state["budget"].calls_used += n
    return state


def consume_round(state: LabProjectState) -> LabProjectState:
    state["budget"].rounds_used += 1
    return state
