"""PBI-038 gate: global settings fallback API over HTTP.

No graph, no projects needed — settings live at lab root. Verifies
defaults, round-trips, and every 422 shape.
"""
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.main import create_app

MODELS = {"scientist": "m-sci", "investigator": "m-inv",
          "skeptic": "m-ske", "judge": "m-judge",
          "ideator": "m-ide", "auditor": "m-aud"}
BUDGET = {"max_model_calls": 50, "max_research_rounds": 5,
          "max_sources": 100, "max_sources_per_claim": 10}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    runs_mod._runs.clear()
    with TestClient(create_app(tmp_path)) as client:
        yield client
    clear_graph_cache()
    runs_mod._runs.clear()


def test_models_defaults_are_empty(client):
    body = client.get("/api/v1/settings/models").json()
    assert body == {k: "" for k in MODELS}


def test_models_round_trip(client, tmp_path):
    assert client.put("/api/v1/settings/models",
                      json=MODELS).json() == MODELS
    assert client.get("/api/v1/settings/models").json() == MODELS
    # persisted at lab root, outside any project repo
    assert (tmp_path / "settings.yaml").is_file()


def test_models_judge_overlap_422(client):
    bad = dict(MODELS, judge="m-sci")
    resp = client.put("/api/v1/settings/models", json=bad)
    assert resp.status_code == 422
    assert "overlap" in resp.json()["detail"]


def test_models_auditor_in_rotation_422(client):
    for field in ("scientist", "judge"):
        bad = dict(MODELS, auditor=MODELS[field])
        resp = client.put("/api/v1/settings/models", json=bad)
        assert resp.status_code == 422
        assert "rotation" in resp.json()["detail"]
    # unset auditor is allowed (degrades at audit time, PBI-039)
    ok = dict(MODELS, auditor="")
    assert client.put("/api/v1/settings/models", json=ok).status_code == 200


def test_models_shape_422(client):
    assert client.put("/api/v1/settings/models",
                      json={"scientist": "x"}).status_code == 422
    extra = dict(MODELS, hacker="x")
    assert client.put("/api/v1/settings/models",
                      json=extra).status_code == 422


def test_budget_round_trip_and_validation(client):
    assert client.get("/api/v1/settings/budget").json() == BUDGET
    assert client.put("/api/v1/settings/budget",
                      json=BUDGET).json() == BUDGET
    bad = dict(BUDGET, max_model_calls=0)
    assert client.put("/api/v1/settings/budget",
                      json=bad).status_code == 422
    assert client.put("/api/v1/settings/budget",
                      json={"max_model_calls": 10}).status_code == 422
