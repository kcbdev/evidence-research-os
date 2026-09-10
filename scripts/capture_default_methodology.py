"""One-time capture (PBI-054): serialize the Phase 1-4 hardcoded pipelines
into methodologies/*.yaml. Run once per model-assignment change — the
YAML files are the committed artifacts; this script is the audit trail
of how they were produced.

Usage:
    uv run python scripts/capture_default_methodology.py \
        --project-yaml ../lab-projects/<id>/project.yaml [--ideator ID]

Models come from a REAL project.yaml (fail-closed: no invented model
IDs). --ideator defaults to the scientist's model (documented choice:
ideation wants a strong general model; override explicitly).
"""
import argparse
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))

RESEARCH_STAGES = [
    {"id": "trigger_classifier", "node": "trigger_classifier",
     "route": "route_classifier"},
    {"id": "plan", "node": "plan"},
    {"id": "independent_first_pass", "node": "independent_first_pass",
     "roles": ["scientist", "investigator", "skeptic"]},
    {"id": "evidence_extraction", "node": "evidence_extraction"},
    {"id": "conflict_detection", "node": "conflict_detection",
     "route": "route_conflict"},
    {"id": "targeted_research", "node": "targeted_research"},
    {"id": "adversarial_review", "node": "adversarial_review"},
    {"id": "evidence_adjudication", "node": "evidence_adjudication"},
    {"id": "synthesis", "node": "synthesis"},
    {"id": "citation_audit", "node": "citation_audit",
     "route": "route_audit"},
    {"id": "targeted_repair", "node": "targeted_repair"},
    {"id": "human_checkpoint", "node": "human_checkpoint",
     "interrupt": True},
    {"id": "final_output", "node": "final_output"},
]

TOOLS = ["search_web", "fetch_url", "fetch_pdf", "grep_project",
         "keyword_search", "semantic_search", "citation_verify",
         "store_source", "retrieve_evidence"]


def _base(mid, name, description, modes, stages, models, skills):
    return {
        "id": mid, "name": name, "description": description,
        "is_default": True, "compatible_modes": modes,
        "workflow": {"stages": stages},
        "tools": {"enabled": list(TOOLS)},
        "prompts": {"set": "role-prompts/v1", "overrides": {}},
        "skills": skills,
        "models": dict(models),
        "budget_defaults": {"max_model_calls": 50,
                            "max_research_rounds": 5},
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-yaml", required=True,
                    help="real project.yaml to take models/budget from")
    ap.add_argument("--ideator", default=None,
                    help="ideator model (default: scientist's model)")
    ap.add_argument("--out", default=str(REPO / "backend" / "methodologies"))
    args = ap.parse_args()

    meta = yaml.safe_load(Path(args.project_yaml).read_text(
        encoding="utf-8"))
    council = dict(meta["council_models"])
    ideator = args.ideator or council["scientist"]
    models = {**council, "ideator": ideator,
              "judge": meta["judge_model"]}
    budget = meta.get("budget", {})
    budget_defaults = {
        "max_model_calls": budget.get("max_model_calls", 50),
        "max_research_rounds": budget.get("max_research_rounds", 5)}

    # Brainstorm drops the whole conflict loop (detection AND its
    # targeted leg): the leg is reachable only via conflict's route, so
    # keeping it linearly would EXECUTE it (spending a round) — a
    # behavior change vs the hardcoded branch, not a capture.
    brainstorm_stages = [
        s for s in RESEARCH_STAGES
        if s["id"] not in ("evidence_extraction", "conflict_detection",
                           "targeted_research")]
    brainstorm_stages.insert(
        3, {"id": "novelty_check", "node": "novelty_check"})
    academic_stages = []
    for s in RESEARCH_STAGES:
        academic_stages.append(s)
        if s["id"] == "evidence_adjudication":
            academic_stages.append(
                {"id": "methodology_analysis",
                 "node": "methodology_analysis"})
            academic_stages.append(
                {"id": "reproducibility_audit",
                 "node": "reproducibility_audit"})

    research_skills = {
        "scientist": ["hypothesis-decomposition"],
        "investigator": ["source-retrieval", "contradiction-search"],
        "skeptic": ["adversarial-review-research"],
        "judge": ["evidence-adjudication"]}
    brainstorm_skills = {**research_skills,
                         "ideator": ["divergent-ideation"],
                         "skeptic": ["adversarial-review-brainstorm"]}

    methods = [
        _base("deep-research-council-v1", "Deep Research Council",
              "3-agent evidence council + citation audit — the original "
              "implementation", ["research"], RESEARCH_STAGES, models,
              research_skills),
        _base("brainstorm-ideation-v1", "Brainstorm Ideation",
              "Ideator + novelty check + skeptic review — divergent "
              "exploration, no claims", ["brainstorm"], brainstorm_stages,
              models, brainstorm_skills),
        _base("academic-publication-v1", "Academic Publication",
              "Research pipeline plus methodology analysis and "
              "reproducibility audit — publication-grade rigor",
              ["academic"], academic_stages, models, research_skills),
    ]
    for m in methods:
        m["budget_defaults"] = dict(budget_defaults)

    # Validate every file against the schema before writing anything —
    # a half-captured registry is worse than none.
    from app.models.methodology import Methodology
    parsed = [Methodology(**m) for m in methods]

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for m, p in zip(methods, parsed):
        (out / f"{m['id']}.yaml").write_text(
            yaml.safe_dump(m, sort_keys=False), encoding="utf-8")
        print(f"captured {m['id']} "
              f"(modes={p.compatible_modes}, "
              f"stages={len(p.workflow.stages)})")
    print("Delete app/graph/build.py's hardcoded build_graph now.")


if __name__ == "__main__":
    main()
