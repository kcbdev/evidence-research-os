"""Shared test helper (PBI-054): compile the CAPTURED default
methodology for a mode with model overrides. Replaces the deleted
build_graph() at migrated call sites — tests compile the same YAML
production serves, so they prove the capture, not a fixture.
"""
from pathlib import Path
from app.graph.compile import build_graph_from_methodology
from app.store.methodology import MethodologyStore

METHODOLOGIES = Path(__file__).resolve().parent.parent / "methodologies"


def default_graph(lab_project_path: Path, mode: str,
                  council_models: dict, judge_model: str,
                  methodologies_root: Path = METHODOLOGIES):
    methodology = MethodologyStore(
        methodologies_root).get_default_for_mode(mode)
    methodology.models = {**methodology.models,
                          **dict(council_models),
                          "judge": judge_model}
    return build_graph_from_methodology(methodology, lab_project_path)
