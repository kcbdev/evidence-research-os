"""PBI-077 gate: read-only checkpoint state per node execution.

Real graph + checkpointer, mocked LLM boundary (no live calls). A run
is driven to pause so checkpoints exist, then node states are read back.
"""
import time
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.main import create_app

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    runs_mod._runs.clear()
    with TestClient(create_app(tmp_path)) as client:
        yield client
    clear_graph_cache()
    runs_mod._runs.clear()


def _create(client, **over):
    payload = {"title": "T", "question": "q",
               "council_models": COUNCIL, "judge_model": JUDGE}
    payload.update(over)
    resp = client.post("/api/v1/lab-projects", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _wait_for(client, pid, rid, want, deadline=60.0):
    end = time.time() + deadline
    while time.time() < end:
        status = client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}").json()
        if status["status"] in want:
            return status
        time.sleep(0.2)
    raise AssertionError(f"run {rid} never reached {want}")


def _paused_run(client):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    return pid, rid


def test_checkpoint_state_matches_run(client, tmp_path):
    pid, rid = _paused_run(client)
    body = client.get(
        f"/api/v1/lab-projects/{pid}/runs/{rid}/checkpoints/plan",
        params={"occurrence": 1}).json()
    assert body["node"] == "plan" and body["occurrence"] == 1
    state = body["state"]
    assert state["lab_project_id"] == pid
    assert state["session_id"] == rid
    assert state["mode"] == "research"
    assert isinstance(state["budget"]["calls_used"], int)
    # Read-only proof: no new commits from any number of reads.
    from app.store.lab_project import LabProjectStore
    before = LabProjectStore(tmp_path, pid).repo.head.commit.hexsha
    client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}/checkpoints/plan")
    assert LabProjectStore(tmp_path, pid).repo.head.commit.hexsha == before


def test_checkpoint_404_shapes(client):
    pid, rid = _paused_run(client)
    base = f"/api/v1/lab-projects/{pid}/runs/{rid}/checkpoints"
    assert client.get(f"{base}/ghost-node").status_code == 404
    assert client.get(f"{base}/plan",
                      params={"occurrence": 99}).status_code == 404
    assert client.get(f"{base}/plan",
                      params={"occurrence": 0}).status_code == 422
    assert client.get(
        f"/api/v1/lab-projects/{pid}/runs/nope/checkpoints/plan"
    ).status_code == 404
