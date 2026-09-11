"""PBI-055 gate: methodology registry API.

GETs hit the real committed registry (read-only, safe); every
mutation runs against a tmp store via monkeypatched module attr —
tests must never write the shipped YAMLs.
"""
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.main import create_app
from app.store.methodology import MethodologyStore

MINIMAL = {
    "id": "test-pipe-v1", "name": "Test Pipe", "description": "d",
    "is_default": False, "compatible_modes": ["research"],
    "workflow": {"stages": [
        {"id": "plan", "node": "plan"},
        {"id": "final_output", "node": "final_output"}]},
    "tools": {"enabled": []}, "prompts": {"set": "x"},
    "skills": {}, "models": {"scientist": "m", "judge": "j"},
    "budget_defaults": {},
}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import app.api.methodologies as methodologies_api
    monkeypatch.setattr(methodologies_api, "store",
                        MethodologyStore(tmp_path / "m"))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    runs_mod._runs.clear()
    with TestClient(create_app(tmp_path)) as client:
        yield client
    clear_graph_cache()
    runs_mod._runs.clear()


def test_seeded_registry_lists_captured_three(tmp_path):
    from fastapi.testclient import TestClient as TC
    from app.main import create_app as ca
    with TC(ca(tmp_path)) as c:
        ids = sorted(m["id"] for m in
                     c.get("/api/v1/methodologies").json())
    # The three captured pipelines must always be present (subset, not
    # exact list — witness/experimental files come and go by design).
    assert {"academic-publication-v1",
            "brainstorm-ideation-v1",
            "deep-research-council-v1"} <= set(ids)
    one = c.get("/api/v1/methodologies/deep-research-council-v1").json()
    assert one["is_default"] is True
    assert len(one["workflow"]["stages"]) == 13
    assert c.get("/api/v1/methodologies/nope").status_code == 404


def test_crud_round_trip(client):
    created = client.post("/api/v1/methodologies", json=MINIMAL)
    assert created.status_code == 201
    assert created.json()["id"] == "test-pipe-v1"
    fetched = client.get(
        "/api/v1/methodologies/test-pipe-v1").json()
    assert fetched["name"] == "Test Pipe"
    updated = dict(MINIMAL, name="Renamed")
    assert client.put("/api/v1/methodologies/test-pipe-v1",
                      json=updated).json()["name"] == "Renamed"
    mismatch = dict(MINIMAL, id="other")
    assert client.put("/api/v1/methodologies/test-pipe-v1",
                      json=mismatch).status_code == 422
    assert client.put("/api/v1/methodologies/ghost",
                      json=dict(MINIMAL, id="ghost")).status_code == 404
    dup = client.post("/api/v1/methodologies", json=MINIMAL)
    assert dup.status_code == 409


def test_validation_names_the_field(client):
    bad_node = dict(MINIMAL, id="bad-1")
    bad_node["workflow"] = {"stages": [{"id": "a", "node": "nope"}]}
    resp = client.post("/api/v1/methodologies", json=bad_node)
    assert resp.status_code == 422
    assert "unknown node 'nope'" in resp.json()["detail"]
    bad_shape = dict(MINIMAL, id="bad-2")
    bad_shape["workflow"] = {"stages": [
        {"id": "a", "node": "plan", "teleport": True}]}
    assert client.post("/api/v1/methodologies",
                       json=bad_shape).status_code == 422  # unknown key
    overlap = dict(MINIMAL, id="bad-3")
    overlap["models"] = {"scientist": "m", "judge": "m"}
    assert client.post("/api/v1/methodologies",
                       json=overlap).status_code == 422  # overlap


def test_set_default_flips_holder(client):
    first = dict(MINIMAL, id="first", is_default=True)
    second = dict(MINIMAL, id="second", is_default=False)
    client.post("/api/v1/methodologies", json=first)
    client.post("/api/v1/methodologies", json=second)
    assert client.post(
        "/api/v1/methodologies/second/set-default").json() == \
        {"default": "second"}
    assert client.get(
        "/api/v1/methodologies/first").json()["is_default"] is False
    assert client.get(
        "/api/v1/methodologies/second").json()["is_default"] is True
    assert client.post(
        "/api/v1/methodologies/ghost/set-default").status_code == 404
