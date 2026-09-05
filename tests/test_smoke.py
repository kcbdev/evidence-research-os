"""Onboarding smoke gate — repo-scaffold health.

This is the seed of the deterministic gate chain (see AGENTS.md §3).
PBIs extend it: backend suite under `backend/tests/`, frontend checks
under `frontend/`. Nothing here tests product behavior yet — there is
no product code; Phase 0/1 arrive via asdlc-plan PBIs.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_python_version_supported():
    import sys

    assert sys.version_info >= (3, 12), (
        f"requires-python >=3.12, got {sys.version.split()[0]}"
    )


def test_v1_docs_present():
    for name in [
        "Evidence-Research-OS-Technical-Spec-v1.md",
        "Evidence-Research-OS-Implementation-Plan-v1.md",
        "Evidence-Research-OS-Implementation-Guide-Phase0-1.md",
    ]:
        assert (ROOT / "DOCS" / name).is_file(), f"missing DOCS/{name}"


def test_spec_declares_evidence_graph_object_types():
    spec = (ROOT / "DOCS" / "Evidence-Research-OS-Technical-Spec-v1.md").read_text(
        encoding="utf-8"
    )
    for obj in [
        "Source",
        "Claim",
        "Evidence",
        "Contradiction",
        "Experiment",
        "Decision",
        "Task",
        "Idea",
    ]:
        assert f"`{obj}`" in spec, f"spec does not declare object type {obj}"
