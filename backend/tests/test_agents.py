"""PBI-008 gate: judge exclusion refuses bad runs before any node executes."""
from pathlib import Path

import pytest
from app.agents.config import validate_model_assignment
from app.graph.build import build_graph

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}


def test_overlap_refuses_for_every_role():
    for role, model in COUNCIL.items():
        with pytest.raises(ValueError, match="self-preference"):
            validate_model_assignment(COUNCIL, model)


def test_distinct_judge_passes():
    validate_model_assignment(COUNCIL, "m-judge")  # must not raise


def test_build_graph_overlap_creates_nothing(tmp_path):
    proj = tmp_path / "proj"
    with pytest.raises(ValueError, match="self-preference"):
        build_graph(proj, COUNCIL, "m-sci")
    assert not proj.exists()  # refused before any node, dir, or sqlite


def test_build_graph_requires_model_assignment(tmp_path):
    with pytest.raises(TypeError):
        build_graph(tmp_path / "proj")  # type: ignore[call-arg]
    # Fail-closed: no bare construction site may skip the judge check.


def test_prompt_files_present_and_on_role():
    prompts = Path(__file__).resolve().parent.parent / "app" / "agents" / "prompts"
    expectations = {
        "scientist.md": "falsification condition",
        "investigator.md": "contradictory evidence",
        "skeptic.md": "weaknesses",
        "judge.md": "not consensus",
    }
    for filename, phrase in expectations.items():
        text = (prompts / filename).read_text(encoding="utf-8")
        assert phrase in text, f"{filename} lost its role-defining line"
