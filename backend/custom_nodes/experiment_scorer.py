"""Example Tier C custom node (PBI-060).

Bespoke scoring of proposed experiments by feasibility x novelty —
exactly the kind of thing that fits neither Tier A (deterministic
formula, not prompted judgment) nor Tier B (real computation, not a
one-line expression).

Signature MAY be `run(state)` (guide-literal, pure) or
`run(state, lab_project_path)` (store access — used here). The
compiler adapts. Writes a transcript to debates/ (run artifact,
ADR-0001); returns {} (no schema change for an example — a production
node needing structured output extends the evidence models first).
"""
from pathlib import Path

from app.store.lab_project import LabProjectStore

NODE_ID = "experiment_scorer"

_FEASIBILITY_WEIGHT = {"high": 1.0, "medium": 0.6, "low": 0.3}


def _score(feasibility: str, is_novel: bool) -> float:
    return _FEASIBILITY_WEIGHT.get(feasibility, 0.3) * (1.0 if is_novel else 0.5)


def run(state, lab_project_path):
    # TOOL-LAYER: none needed here (store + arithmetic only). A node
    # fetching URLs must use cached_fetch_url, never raw HTTP.
    store = LabProjectStore(Path(lab_project_path),
                            state["lab_project_id"])
    lines = ["# Experiment scores (feasibility x novelty)", ""]
    for idea in sorted(store.list_ideas(), key=lambda i: i.id):
        exp = idea.proposed_experiment
        if exp is None:
            continue
        novel = (idea.novelty_check is not None
                 and idea.novelty_check.status == "novel")
        lines.append(f"- {idea.id}: {_score(exp.feasibility, novel):.2f} "
                     f"(feasibility={exp.feasibility}, novel={novel})")
    if len(lines) == 2:
        lines.append("(no proposed experiments yet)")
    debates = Path(lab_project_path) / state["lab_project_id"] / "debates"
    debates.mkdir(parents=True, exist_ok=True)
    (debates / "experiment_scores.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8")
    return {}
