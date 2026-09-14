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
    "coverage_check": nodes.make_coverage_check,  # PBI-074
    "meta_review": nodes.make_meta_review,  # PBI-074
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


def route_coverage(s):
    """PBI-074: coverage findings re-enter research; a clean sweep (or
    an exhausted budget — never spend past limits) proceeds."""
    if is_exhausted(s):
        return "synthesis"
    return "targeted_research" if s.get("pending_tasks") else "synthesis"


def route_meta(s):
    """PBI-074: incoherent drafts loop back to synthesis; exhaustion
    short-circuits forward (never loop without budget)."""
    if is_exhausted(s):
        return "citation_audit"
    return "synthesis" if not s.get("meta_review_passed", True) \
        else "citation_audit"


CONDITION_REGISTRY = {
    # routers (PBI-053 `route` form)
    "route_classifier": route_classifier,
    "route_conflict": route_conflict,
    "route_audit": route_audit,
    "route_coverage": route_coverage,  # PBI-074
    "route_meta": route_meta,  # PBI-074
    # loop predicates (guide `loop_while` form)
    "has_open_contradictions": lambda s: bool(s["open_contradictions"]),
    "audit_failed": lambda s: not s["audit_passed"],
}
