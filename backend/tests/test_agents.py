"""PBI-008 gate: judge exclusion refuses bad runs before any node executes."""
from pathlib import Path

import httpx
import openai
import pytest
from app.agents import client as client_mod
from app.agents.config import validate_model_assignment
from app.graph.build import build_graph

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}


def test_overlap_refuses_for_every_role():
    for role, model in COUNCIL.items():
        with pytest.raises(ValueError, match="self-preference"):
            validate_model_assignment(COUNCIL, model)


def test_distinct_judge_passes():
    validate_model_assignment(COUNCIL, "m-judge")  # must not raise


def _api_error():
    return openai.APIConnectionError(
        request=httpx.Request("POST", "https://x"))


def test_resilient_returns_attempts_on_transient_empty(monkeypatch):
    calls, sleeps = [], []
    responses = [ValueError("empty completion from m"), "ok!"]

    def fake(model, system, user):
        calls.append(model)
        result = responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(client_mod, "call_model", fake)
    content, attempts = client_mod.call_model_resilient(
        "m", "s", "u", sleep=sleeps.append)
    assert (content, attempts) == ("ok!", 2)
    assert calls == ["m", "m"] and sleeps == [1]  # linear backoff


def test_resilient_raises_last_failure_after_max(monkeypatch):
    calls, sleeps = [], []

    def always_empty(model, system, user):
        calls.append(model)
        raise ValueError("empty completion from m")

    monkeypatch.setattr(client_mod, "call_model", always_empty)
    with pytest.raises(ValueError, match="empty completion"):
        client_mod.call_model_resilient("m", "s", "u",
                                        sleep=sleeps.append)
    assert len(calls) == 3 and sleeps == [1, 2]  # exactly max attempts


def test_resilient_reraises_api_error_with_type(monkeypatch):
    def always_down(model, system, user):
        raise _api_error()

    monkeypatch.setattr(client_mod, "call_model", always_down)
    with pytest.raises(openai.APIConnectionError):
        client_mod.call_model_resilient("m", "s", "u",
                                        max_attempts=2,
                                        sleep=lambda s: None)


def test_resilient_passes_through_non_api_errors(monkeypatch):
    calls = []

    def broken(model, system, user):
        calls.append(model)
        raise KeyError("programming bug, not transport")

    monkeypatch.setattr(client_mod, "call_model", broken)
    with pytest.raises(KeyError):
        client_mod.call_model_resilient("m", "s", "u",
                                        sleep=lambda s: (_ for _ in ()).throw(
                                            AssertionError("must not sleep")))
    assert calls == ["m"]  # immediate, no retry


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
