"""Role prompt loader. Prompts live in files (guide §3.3), never inline:
they iterate independently of code. The leading `# <role>` header line
is packaging metadata — callers get the body."""
from pathlib import Path

_PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"

_ROLE_FILES = {
    "scientist": "scientist.md",
    "investigator": "investigator.md",
    "skeptic": "skeptic.md",
    "judge": "judge.md",
    "ideator": "ideator.md",  # PBI-034: brainstorm fourth chair
    "skeptic-brainstorm": "skeptic-brainstorm.md",  # PBI-035: brainstorm rubric
}

SKEPTIC_RESEARCH_RUBRIC = "research"
SKEPTIC_BRAINSTORM_RUBRIC = "brainstorm"


def load_prompt(role: str) -> str:
    try:
        filename = _ROLE_FILES[role]
    except KeyError:
        raise ValueError(f"unknown council role: {role!r}")
    lines = (_PROMPTS_DIR / filename).read_text(encoding="utf-8").splitlines()
    body = [ln for ln in lines if not (ln.startswith("# ") and ln == lines[0])]
    return "\n".join(body).strip() + "\n"


def get_skeptic_rubric(mode: str) -> str:
    """PBI-035: mode-conditional Skeptic rubric.
    Returns the prompt filename suffix for the given mode."""
    if mode == "brainstorm":
        return "skeptic-brainstorm"
    return "skeptic"
