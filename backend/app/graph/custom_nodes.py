"""Tier C custom-node discovery (PBI-060, Phase 5b guide).

Each file in `custom_nodes/` (sibling of `app/`, git-tracked with the
repo) defines `NODE_ID: str` and `def run(state) -> state`. Loaded at
graph-build time, merged OVER the built-in registry (shadowing warns,
like Tier A). No sandboxing — trusted code, same level as the backend
itself, because only the operator authors it.

Guardrails (code-review discipline for future-you, not enforced):
- Route through the tool layer (`cached_fetch*`, index searches),
  never direct HTTP — mark tool use with `# TOOL-LAYER:` comments so
  violations are greppable.
- Version like everything else (git revert is the rollback).
- Respect the budget controller (read/write state["budget"]).
- Second human author = revisit sandboxing (WASM/container). Not
  today; flagged so it isn't forgotten if the trust model changes.
"""
import importlib.util
import inspect
from pathlib import Path

CUSTOM_NODES_DIR = Path(__file__).resolve().parent.parent.parent / "custom_nodes"


def discover_custom_nodes(directory: Path | None = None) -> dict:
    """{NODE_ID: run}. Every failure is loud with filename + reason —
    a broken custom file must never silently vanish from the graph."""
    directory = Path(directory) if directory is not None else CUSTOM_NODES_DIR
    discovered: dict = {}
    sources: dict[str, str] = {}
    if not directory.is_dir():
        return discovered
    for f in sorted(directory.glob("*.py")):
        if f.name.startswith("_"):
            continue  # private helpers, not nodes
        try:
            spec = importlib.util.spec_from_file_location(
                f"custom_nodes.{f.stem}", f)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
        except Exception as exc:
            raise ValueError(
                f"custom node {f.name} failed to load: {exc}")
        node_id = getattr(mod, "NODE_ID", None)
        if not node_id:
            raise ValueError(
                f"custom node {f.name} defines no NODE_ID: str")
        run = getattr(mod, "run", None)
        if not callable(run):
            raise ValueError(
                f"custom node {f.name} defines no run(state) function")
        arity = len(inspect.signature(run).parameters)
        if arity not in (1, 2):
            raise ValueError(
                f"custom node {f.name} run() must take (state) or "
                f"(state, lab_project_path), got {arity} params")
        if node_id in discovered:
            raise ValueError(
                f"duplicate custom NODE_ID '{node_id}' "
                f"({f.name} vs {sources[node_id]})")
        discovered[node_id] = run
        sources[node_id] = f.name
    return discovered


def adapt_run(run, lab_project_path):
    """Adapt a discovered run to a zero-arg-builder node function.
    1-arg (guide-literal) runs pass through; 2-arg runs receive the
    project path (arity was validated at discovery)."""
    if len(inspect.signature(run).parameters) >= 2:
        return lambda state: run(state, lab_project_path)
    return lambda state: run(state)


def get_full_node_registry() -> dict:
    """Built-ins overlaid with discovered Tier C nodes (custom wins on
    collision, with a warning — same rule as Tier A roles). Discovery
    failures propagate (loud, with filename)."""
    import warnings
    from app.graph.registry import NODE_REGISTRY
    full = dict(NODE_REGISTRY)
    for node_id, run in discover_custom_nodes().items():
        if node_id in full:
            warnings.warn(
                f"custom node '{node_id}' shadows a built-in node")
        full[node_id] = (lambda r: (lambda path: adapt_run(r, path)))(run)
    return full
