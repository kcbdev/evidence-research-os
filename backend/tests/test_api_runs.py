"""PBI-014 gate: project CRUD + full run lifecycle over HTTP.

LLM boundary mocked (nodes.call_model); graph/stream/threads are real.
Polling loops carry deadlines — no timing flakes, no hangs (daemon
threads + RESTING statuses always terminate the waits).
"""
import time
import pytest
from fastapi.testclient import TestClient
from app.api.runs import clear_graph_cache
from app.main import create_app
from app.store.lab_project import LabProjectStore

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model", lambda *a, **k: "")
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    with TestClient(create_app(tmp_path)) as client:
        yield client
    clear_graph_cache()


def _create(client, **over):
    payload = {"title": "T", "question": "q",
               "council_models": COUNCIL, "judge_model": JUDGE}
    payload.update(over)
    resp = client.post("/api/v1/lab-projects", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _wait_for(client, pid, rid, want, deadline=30.0):
    end = time.time() + deadline
    while time.time() < end:
        status = client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}").json()
        if status["status"] in want:
            return status
        time.sleep(0.2)
    raise AssertionError(f"run {rid} never reached {want}")


def test_create_list_get_project(client):
    pid = _create(client)
    ids = [p["id"] for p in client.get("/api/v1/lab-projects").json()]
    assert pid in ids
    full = client.get(f"/api/v1/lab-projects/{pid}").json()
    assert full["title"] == "T" and full["counts"]["claims"] == 0
    assert client.post("/api/v1/lab-projects",
                       json={"title": "x"}).status_code == 422
    assert client.get("/api/v1/lab-projects/nope").status_code == 404


def test_default_models_refuse_to_run(client):
    resp = client.post("/api/v1/lab-projects",
                       json={"title": "T", "question": "q"})
    pid = resp.json()["id"]  # creation itself is fine (fail-closed later)
    bad = client.post(f"/api/v1/lab-projects/{pid}/runs", json={})
    assert bad.status_code == 400 and "self-preference" in bad.text


def test_full_run_pause_approve_done(client, tmp_path):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    paused = _wait_for(client, pid, rid, {"awaiting_approval"})
    assert "plan" in [e["node"] for e in paused["events"]]
    assert paused["needs_approval"] is True
    # Early approve of nothing / wrong project guards:
    assert client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                       json={"decision": "maybe"}).status_code in (400, 422)
    done = client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                       json={"decision": "approve",
                             "note": "scope ok"}).json()
    assert done["status"] == "running"
    final = _wait_for(client, pid, rid, {"done"})
    assert final["needs_approval"] is False
    store = LabProjectStore(tmp_path, pid)
    decisions = {d.id: d.what for d in store.list_decisions()}
    assert decisions[f"D-approve-{rid}"] == "Human approved run at checkpoint"
    assert decisions[f"D-terminal-{rid}"] == "Run ended: completed"
    assert (tmp_path / pid / "output" / "report.md").is_file()
    # Second approval has nothing to approve:
    assert client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                       json={}).status_code == 400


def test_reject_path_records_and_stops(client, tmp_path):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    out = client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                      json={"decision": "reject", "note": "wrong scope"}).json()
    assert out["status"] == "rejected"
    store = LabProjectStore(tmp_path, pid)
    assert "rejected" in store.read_decision(f"D-approve-{rid}").what


def test_sse_replays_node_events(client):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    resp = client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}/stream")
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    assert '"node":"plan"' in resp.text.replace(" ", "")


def test_plan_artifact_adr_exists():
    from pathlib import Path
    adr = Path(__file__).resolve().parent.parent.parent / "docs" / "adrs" \
        / "0001-plan-artifacts-outside-store.md"
    assert adr.is_file()
