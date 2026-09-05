"""Scaffold gate: proves the PBI-001 skeleton exists and declares its contract.

Domain behavior arrives in later PBIs; this file only guards the structure
they build on (pyproject deps, package layout, data-dir ignore rules).
"""
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
ROOT = BACKEND.parent

EXPECTED_PACKAGES = [
    "app/__init__.py",
    "app/main.py",
    "app/config.py",
    "app/models/__init__.py",
    "app/store/__init__.py",
    "app/graph/__init__.py",
    "app/agents/__init__.py",
    "app/tools/__init__.py",
    "app/api/__init__.py",
]

EXPECTED_DEPS = [
    "fastapi",
    "uvicorn",
    "sse-starlette",
    "langgraph",
    "langgraph-checkpoint-sqlite",
    "openai",
    "pydantic",
    "pyyaml",
    "gitpython",
    "httpx",
    "trafilatura",
    "pypdf",
]


def test_package_layout_exists():
    for rel in EXPECTED_PACKAGES:
        assert (BACKEND / rel).is_file(), f"missing backend/{rel}"


def test_pyproject_declares_guide_deps():
    pyproject = (BACKEND / "pyproject.toml").read_text(encoding="utf-8")
    assert 'requires-python = ">=3.12"' in pyproject
    for dep in EXPECTED_DEPS:
        assert dep in pyproject, f"pyproject missing dependency {dep}"


def test_lab_projects_dir_is_gitignored():
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "lab-projects/" in gitignore
    assert (ROOT / "lab-projects").is_dir()
