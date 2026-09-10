"""Methodology store (PBI-054; API lands in PBI-055).

YAML files under a methodologies dir (default:
`<backend>/methodologies`, captured by
scripts/capture_default_methodology.py). Git-tracked with the repo —
a bad methodology is a bad commit, revertable the same way.
`set_default` unsets every methodology sharing ANY mode with the
target (defaults are per-mode in effect, even though the flag is
per-file).
"""
import yaml
from pathlib import Path
from app.models.methodology import Methodology

DEFAULT_DIR = Path(__file__).resolve().parent.parent.parent / "methodologies"


class MethodologyStore:
    def __init__(self, root: Path | None = None):
        self.root = Path(root) if root is not None else DEFAULT_DIR
        self.root.mkdir(parents=True, exist_ok=True)

    def list(self) -> list[Methodology]:
        return [Methodology(**yaml.safe_load(f.read_text(encoding="utf-8")))
                for f in sorted(self.root.glob("*.yaml"))]

    def get(self, id: str) -> Methodology:
        path = self.root / f"{id}.yaml"
        if not path.is_file():
            raise KeyError(f"unknown methodology: {id}")
        return Methodology(**yaml.safe_load(
            path.read_text(encoding="utf-8")))

    def save(self, m: Methodology):
        (self.root / f"{m.id}.yaml").write_text(
            yaml.safe_dump(m.model_dump(mode="json"), sort_keys=False),
            encoding="utf-8")

    def get_default_for_mode(self, mode: str) -> Methodology:
        for m in self.list():
            if m.is_default and mode in m.compatible_modes:
                return m
        raise ValueError(f"no default methodology for mode {mode!r}")

    def set_default(self, id: str):
        target = self.get(id)
        for m in self.list():
            if m.is_default and m.id != id and \
                    set(m.compatible_modes) & set(target.compatible_modes):
                m.is_default = False
                self.save(m)
        target.is_default = True
        self.save(target)
