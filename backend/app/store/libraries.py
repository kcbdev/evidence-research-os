"""Builder library stores (PBI-063).

One YAML file per library entry under `<backend>/libraries/{skills,
prompts,roles}/`, mirroring MethodologyStore exactly (list/get/save,
KeyError on missing, caller-owned 409 on duplicate create).
Git-tracked with the repo like methodologies — a bad library entry
is a bad commit, revertable the same way. Prompt version history is
embedded in the entry file (no sidecar files to lose).
"""
import yaml
from pathlib import Path
from app.models.libraries import LibraryRole, Prompt, Skill

DEFAULT_DIR = Path(__file__).resolve().parent.parent.parent / "libraries"


class LibraryStore:
    """Generic YAML-per-id store. `model` is the Pydantic class stored
    in `kind/` (Skill, Prompt, or LibraryRole). Tests pass a tmp root
    — mutating the shipped libraries in tests is never acceptable."""

    def __init__(self, root: Path | None, kind: str, model):
        base = Path(root) if root is not None else DEFAULT_DIR
        self.dir = base / kind
        self.dir.mkdir(parents=True, exist_ok=True)
        self.model = model

    def list(self):
        return [self.model(**yaml.safe_load(f.read_text(encoding="utf-8")))
                for f in sorted(self.dir.glob("*.yaml"))]

    def get(self, id: str):
        path = self.dir / f"{id}.yaml"
        if not path.is_file():
            raise KeyError(f"unknown {self.dir.name} entry: {id}")
        return self.model(**yaml.safe_load(
            path.read_text(encoding="utf-8")))

    def save(self, entry):
        (self.dir / f"{entry.id}.yaml").write_text(
            yaml.safe_dump(entry.model_dump(mode="json"), sort_keys=False),
            encoding="utf-8")
