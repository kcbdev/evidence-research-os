"""Node & condition registries (PBI-053, Phase 5 guide Task 39).

Registry values are UNIFORM BUILDERS `builder(lab_project_path) ->
node_fn` — the as-built nodes are `make_*` factories, so they
register directly; zero-arg nodes (trigger_classifier,
human_checkpoint) wrap in a lambda. The compiler never special-cases
arity. Adding a stage type later = one entry here, never compiler
 surgery.

Predicates mirror build.py's branch closures EXACTLY (duplicated for
one PBI on purpose — build.py is deleted in PBI-054, and sharing code
with a dead man walking would tangle the cutover). `route_*`
functions return the next stage id (or "END"); `loop_*` booleans back
the guide's loop_while form.
"""
from app.graph import nodes
from app.graph.budget import is_exhausted


def _bare(fn):
    return lambda _path: fn


NODE_REGISTRY = {
    "trigger_classifier": _bare(nodes.trigger_classifier),
    "plan": nodes.make_plan,
    "independent_first_pass": nodes.make_independent_first_pass,
    "evidence_extraction": nodes.make_evidence_extraction,
    "conflict_detection": nodes.make_conflict_detection,
    "novelty_check": nodes.make_novelty_check,
    "targeted_research": nodes.make_targeted_research,
    "adversarial_review": nodes.make_adversarial_review,
    "evidence_adjudication": nodes.make_evidence_adjudication,
    "methodology_analysis": nodes.make_methodology_analysis,
    "reproducibility_audit": nodes.make_reproducibility_audit,
    "synthesis": nodes.make_synthesis,
    "citation_audit": nodes.make_citation_audit,
    "targeted_repair": nodes.make_targeted_repair,
    "human_checkpoint": _bare(nodes.human_checkpoint),
    "final_output": nodes.make_final_output,
}


def route_classifier(s):
    return "plan" if s["escalate"] else "final_output"


def route_conflict(s):
    if is_exhausted(s):
        return "final_output"
    return "targeted_research" if s["open_contradictions"] \
        else "adversarial_review"


def route_audit(s):
    if is_exhausted(s):
        return "final_output"
    return "human_checkpoint" if s["audit_passed"] else "targeted_repair"


CONDITION_REGISTRY = {
    # routers (PBI-053 `route` form)
    "route_classifier": route_classifier,
    "route_conflict": route_conflict,
    "route_audit": route_audit,
    # loop predicates (guide `loop_while` form)
    "has_open_contradictions": lambda s: bool(s["open_contradictions"]),
    "audit_failed": lambda s: not s["audit_passed"],
}
