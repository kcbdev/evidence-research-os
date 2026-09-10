"""Lab-root settings fallback (PBI-038).

One `settings.yaml` beside the projects (runtime config, untracked —
same class as `runs.db`, never inside a Lab Project repo). Holds the
global model assignment (6 roles incl. the non-rotating auditor) and
budget defaults that new Lab Projects/methodologies inherit when they
don't specify their own. No git handling: lab root is not a repo.
"""
import yaml
from pathlib import Path
from pydantic import BaseModel, Field

MODEL_ROLES = ("scientist", "investigator", "skeptic", "judge",
               "ideator", "auditor")


class ModelAssignment(BaseModel):
    scientist: str = ""
    investigator: str = ""
    skeptic: str = ""
    judge: str = ""
    ideator: str = ""
    auditor: str = ""  # must stay outside council/judge rotation


class BudgetDefaults(BaseModel):
    max_model_calls: int = Field(default=50, gt=0)
    max_research_rounds: int = Field(default=5, gt=0)
    max_sources: int = Field(default=100, gt=0)
    max_sources_per_claim: int = Field(default=10, gt=0)


class Settings(BaseModel):
    models: ModelAssignment = ModelAssignment()
    budget: BudgetDefaults = BudgetDefaults()


class SettingsStore:
    def __init__(self, root: Path):
        self._file = Path(root) / "settings.yaml"

    def read(self) -> Settings:
        if not self._file.is_file():
            return Settings()  # never invented: explicit defaults
        return Settings(**yaml.safe_load(
            self._file.read_text(encoding="utf-8")))

    def write(self, settings: Settings):
        self._file.write_text(
            yaml.safe_dump(settings.model_dump(mode="json")),
            encoding="utf-8")
