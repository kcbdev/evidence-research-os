"""Ideator agent (PBI-034, Phase 2 guide Task 22).

Proposes one novel angle per call as structured lines; the brainstorm
first-pass loop calls this repeatedly with the growing idea list as
context. Parsing is strict on shape, lenient on content: a missing or
insubstantial IDEA line yields None (the caller skips the write but
still charges the attempts — junk is never free).
"""
from app.agents.client import call_model_resilient
from app.agents.prompts import load_prompt

IDEA_FORMAT = """
Reply with exactly these four lines (one idea only):
IDEA: <one-sentence novel angle>
HYPOTHESIS: <concrete hypothesis>
FALSIFICATION: <experiment whose null result kills it>
FEASIBILITY: <high|medium|low>
"""

FEASIBILITY = ("high", "medium", "low")


def parse_idea(text: str) -> dict | None:
    """Parse IDEA/HYPOTHESIS/FALSIFICATION/FEASIBILITY lines.

    Returns None when there is no substantial IDEA line — same floor as
    the findings parser (PBI-019 witness): >= 10 chars, no placeholders.
    FEASIBILITY outside the literal degrades to "medium" (a bad tag voids
    only the tag, never the idea — PBI-023 pattern).
    """
    fields: dict[str, str] = {}
    for line in (text or "").splitlines():
        line = line.strip()
        for key in ("IDEA", "HYPOTHESIS", "FALSIFICATION", "FEASIBILITY"):
            if line.startswith(key + ":"):
                fields[key] = line[len(key) + 1:].strip()
    statement = fields.get("IDEA", "")
    if len(statement) < 10:
        return None
    feasibility = fields.get("FEASIBILITY", "medium").lower()
    if feasibility not in FEASIBILITY:
        feasibility = "medium"
    return {
        "statement": statement,
        "hypothesis": fields.get("HYPOTHESIS", ""),
        "falsification_condition": fields.get("FALSIFICATION", ""),
        "feasibility": feasibility,
    }


def propose(question: str, existing_ideas: list[str],
            model_id: str) -> tuple[dict | None, int]:
    """One ideation call. Returns (parsed idea or None, attempts made)."""
    context = "\n".join(f"- {i}" for i in existing_ideas) or "(none yet)"
    user = (f"Question: {question}\n\nExisting ideas so far:\n{context}\n\n"
            f"Propose a new angle.\n{IDEA_FORMAT}")
    text, attempts = call_model_resilient(
        model_id, load_prompt("ideator"), user)
    return parse_idea(text), attempts
