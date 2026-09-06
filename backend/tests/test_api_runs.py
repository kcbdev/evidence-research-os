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
    assert any(e.get("etype") == "run_done" for e in final["events"])
    store = LabProjectStore(tmp_path, pid)
    decisions = {d.id: d.what for d in store.list_decisions()}
    assert decisions[f"D-approve-{rid}"] == "Human approved run at checkpoint"
    assert "scope ok" in store.read_decision(f"D-approve-{rid}").why
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
    compact = resp.text.replace(" ", "")
    assert '"node":"plan"' in compact
    # Typed pause event the frontend keys its modal off (spec §9.3):
    assert "event:human_checkpoint" in compact


def test_approve_guards(client):
    import time as _time
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    # Wrong project id for a real run id:
    assert client.post(f"/api/v1/lab-projects/nope/runs/{rid}/approve",
                       json={}).status_code == 404
    # Unknown run id:
    assert client.post(f"/api/v1/lab-projects/{pid}/runs/nope/approve",
                       json={}).status_code == 404
    _wait_for(client, pid, rid, {"awaiting_approval"})  # still waiting
    out = client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                      json={"decision": "approve"}).json()
    assert out["status"] == "running"
    _wait_for(client, pid, rid, {"done"})
    _time.sleep(0.1)


def test_approve_while_running_is_rejected(client, monkeypatch):
    import time as _time
    monkeypatch.setattr("app.graph.nodes.call_model", _slow_mock)
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _time.sleep(0.5)  # run is mid-first-pass (3 slow calls)
    resp = client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                       json={})
    assert resp.status_code == 400
    _wait_for(client, pid, rid, {"awaiting_approval"}, deadline=60.0)


def _slow_mock(*a, **k):
    import time as _time
    _time.sleep(2)
    return ""


def test_graph_cache_revalidates_per_run(tmp_path, monkeypatch):
    from app.api.runs import get_graph
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    pid = _create_client_project(tmp_path)
    g1 = get_graph(tmp_path, pid, COUNCIL, JUDGE)
    assert get_graph(tmp_path, pid, COUNCIL, JUDGE) is g1  # cached
    with pytest.raises(ValueError, match="self-preference"):
        get_graph(tmp_path, pid, COUNCIL, "m-sci")  # tampered: still refuses


def _create_client_project(tmp_path):
    from app.store.lab_project import LabProjectStore
    from app.models.evidence import ProjectMeta
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(id="p", title="t", question="q",
                                 created_at="2026-09-05T10:00:00Z",
                                 council_models=COUNCIL, judge_model=JUDGE))
    return "p"


def test_plan_artifact_adr_exists():
    from pathlib import Path
    # Canonical dir is DOCS/adrs (uppercase — a lowercase `docs/`
    # alias only exists as a Windows case-insensitivity artifact).
    adr = Path(__file__).resolve().parent.parent.parent / "DOCS" / "adrs" \
        / "0001-plan-artifacts-outside-store.md"
    assert adr.is_file()


def test_cors_allows_browser_origin(client):
    # Regression (PBI-019 witness): the control panel at :3000 fetches
    # the API at :8000 cross-origin — browsers require the ACAO header.
    resp = client.get("/api/v1/lab-projects",
                      headers={"Origin": "http://localhost:3000"})
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == \
        "http://localhost:3000"
    preflight = client.options(
        "/api/v1/lab-projects", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST"})
    assert preflight.status_code == 200
