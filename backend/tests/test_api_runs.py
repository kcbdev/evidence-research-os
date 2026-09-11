"""PBI-014 gate: project CRUD + full run lifecycle over HTTP.

LLM boundary mocked (nodes.call_model_resilient); graph/stream/threads are real.
Polling loops carry deadlines — no timing flakes, no hangs (daemon
threads + RESTING statuses always terminate the waits).
"""
import time
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache, rehydrate_runs
from app.main import create_app
from app.store.lab_project import LabProjectStore

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


def _wait_for(client, pid, rid, want, deadline=30.0):
    end = time.time() + deadline
    while time.time() < end:
        status = client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}").json()
        if status["status"] in want:
            return status
        time.sleep(0.2)
    raise AssertionError(f"run {rid} never reached {want}")


# --- PBI-044: retry + record evolution ---

def test_retry_failed_run_resumes_same_id(client, tmp_path, monkeypatch):
    pid = _create(client)

    def _boom(*a, **k):
        raise RuntimeError("model exploded")
    monkeypatch.setattr("app.graph.nodes.call_model_resilient", _boom)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    failed = _wait_for(client, pid, rid, {"failed"})
    assert failed["error"] is not None
    before = failed["events"]
    # Wrong statuses 400 (paused run is not retryable).
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    pid2 = _create(client)
    rid2 = client.post(f"/api/v1/lab-projects/{pid2}/runs",
                       json={}).json()["run_id"]
    _wait_for(client, pid2, rid2, {"awaiting_approval"})
    assert client.post(
        f"/api/v1/lab-projects/{pid2}/runs/{rid2}/retry").status_code == 400
    assert client.post(
        f"/api/v1/lab-projects/{pid}/runs/nope/retry").status_code == 404
    # Heal the model, retry the failed run: same id, events append, done.
    resp = client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/retry")
    assert resp.json() == {"run_id": rid, "status": "running"}
    final = _wait_for(client, pid, rid, {"done", "awaiting_approval"})
    assert final["run_id"] == rid
    assert len(final["events"]) >= len(before)
    assert final["started_at"] is not None
    if final["status"] == "done":
        assert final["duration_s"] is not None
        assert final["duration_s"] >= 0


def test_legacy_six_col_db_migrates_with_history(client, tmp_path):
    import sqlite3
    from app.api.runs import _runs_db
    db = sqlite3.connect(str(tmp_path / "runs.db"))
    try:
        db.execute("""CREATE TABLE runs
            (run_id TEXT PRIMARY KEY, project_id TEXT, status TEXT,
             events_json TEXT, error TEXT, updated_at TEXT)""")
        db.execute("INSERT INTO runs VALUES (?,?,?,?,?,?)",
                   ("r-old", "p-old", "done", "[]", None, "t"))
        db.commit()
    finally:
        db.close()
    _runs_db(tmp_path).close()  # migrate, don't wipe
    db = sqlite3.connect(str(tmp_path / "runs.db"))
    try:
        cols = {r[1] for r in db.execute("PRAGMA table_info(runs)")}
        row = db.execute(
            "SELECT run_id, status FROM runs WHERE run_id = 'r-old'"
            ).fetchone()
    finally:
        db.close()
    assert {"mode", "started_at", "duration_s"} <= cols
    assert row == ("r-old", "done")
    assert rehydrate_runs(tmp_path) == 1
    revived = client.get(
        "/api/v1/lab-projects/p-old/runs/r-old").json()
    assert revived["mode"] == "research"  # legacy default
    assert revived["started_at"] is None


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
    monkeypatch.setattr("app.graph.nodes.call_model_resilient", _slow_mock)
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
    return "", 1


def test_graph_cache_revalidates_per_run(tmp_path, monkeypatch):
    from app.api.runs import clear_graph_cache, get_graph
    from app.store.methodology import MethodologyStore
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    pid = _create_client_project(tmp_path)
    methodology = MethodologyStore().get_default_for_mode("research")
    try:
        g1 = get_graph(tmp_path, pid, "research", methodology,
                       COUNCIL, JUDGE)
        assert get_graph(tmp_path, pid, "research", methodology,
                         COUNCIL, JUDGE) is g1  # cached
        with pytest.raises(ValueError, match="self-preference"):
            get_graph(tmp_path, pid, "research", methodology,
                      COUNCIL, "m-sci")  # tampered: still refuses
        # Edited methodology text recompiles (content-hash cache key).
        tweaked = methodology.model_copy(deep=True)
        tweaked.description = "edited"
        g2 = get_graph(tmp_path, pid, "research", tweaked, COUNCIL, JUDGE)
        assert g2 is not g1
    finally:
        clear_graph_cache()


def _create_client_project(tmp_path):
    from app.store.lab_project import LabProjectStore
    from app.models.evidence import ProjectMeta
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(id="p", title="t", question="q",
                                 created_at="2026-09-05T10:00:00Z",
                                 council_models=COUNCIL, judge_model=JUDGE))
    return "p"


def test_runs_list_newest_first_and_404(client, tmp_path):
    pid = _create(client)
    r1 = client.post(f"/api/v1/lab-projects/{pid}/runs",
                     json={}).json()["run_id"]
    r2 = client.post(f"/api/v1/lab-projects/{pid}/runs",
                     json={}).json()["run_id"]
    rows = client.get(f"/api/v1/lab-projects/{pid}/runs").json()
    assert [r["run_id"] for r in rows] == [r2, r1]
    assert set(rows[0]) == {"run_id", "status", "needs_approval",
                            "events_count", "error", "mode",
                            "started_at", "duration_s",
                            "methodology_id"}  # PBI-056 shape
    assert rows[0]["mode"] == "research"
    assert rows[0]["started_at"] is not None
    assert client.get("/api/v1/lab-projects/ghost/runs").status_code == 404
    assert not (tmp_path / "ghost").exists()  # no mkdir side effect


def test_archive_lifecycle(client, tmp_path):
    from app.models.evidence import Claim, Decision
    from app.store.lab_project import LabProjectStore
    pid = _create(client)
    store = LabProjectStore(tmp_path, pid)
    store.write_claim(Claim(id="C-1", statement="history must survive"))
    store.write_decision(Decision(id="D-1", what="w", why="y",
                                  timestamp="2026-09-08T10:00:00Z"))
    assert pid in [p["id"] for p in
                   client.get("/api/v1/lab-projects").json()]
    first = client.delete(f"/api/v1/lab-projects/{pid}")
    assert first.status_code == 200
    assert first.json() == {"id": pid, "archived": True}
    # Vanishes from default listing, served by detail with marker:
    assert pid not in [p["id"] for p in
                       client.get("/api/v1/lab-projects").json()]
    assert [p["id"] for p in client.get(
        "/api/v1/lab-projects", params={"include_archived": True}).json()] == [pid]
    detail = client.get(f"/api/v1/lab-projects/{pid}").json()
    assert detail["archived"] is True
    # History intact across archive AND second DELETE:
    assert detail["counts"]["claims"] == 1
    assert len(store.list_decisions()) == 1
    second = client.delete(f"/api/v1/lab-projects/{pid}")
    assert second.status_code == 200
    assert second.json() == {"id": pid, "archived": True}
    assert client.get(f"/api/v1/lab-projects/{pid}").json()["counts"]["claims"] == 1
    assert client.delete("/api/v1/lab-projects/ghost").status_code == 404
    assert not (tmp_path / "ghost").exists()  # no mkdir side effect


def test_plan_artifact_adr_exists():
    from pathlib import Path
    # Canonical dir is DOCS/adrs (uppercase — a lowercase `docs/`
    # alias only exists as a Windows case-insensitivity artifact).
    adr = Path(__file__).resolve().parent.parent.parent / "DOCS" / "adrs" \
        / "0001-plan-artifacts-outside-store.md"
    assert adr.is_file()


def test_run_record_persisted_to_sqlite(client, tmp_path):
    import json
    import sqlite3
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    db = sqlite3.connect(str(tmp_path / "runs.db"))
    try:
        row = db.execute(
            "SELECT status, events_json, error FROM runs WHERE run_id = ?",
            (rid,)).fetchone()
    finally:
        db.close()
    assert row is not None
    status, events_json, error = row
    assert status == "awaiting_approval" and error is None
    assert isinstance(json.loads(events_json), list)


def test_paused_run_survives_simulated_restart(client, tmp_path):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    # Simulate restart: drop ALL memory (records + compiled graphs),
    # then rehydrate from runs.db like lifespan does on boot:
    runs_mod._runs.clear()
    clear_graph_cache()
    assert rehydrate_runs(tmp_path) >= 1
    paused = client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}").json()
    assert paused["status"] == "awaiting_approval"
    assert paused["needs_approval"] is True
    # ...and the paused run still approves through to done (lazy graph):
    client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                json={"decision": "approve"})
    final = _wait_for(client, pid, rid, {"done"})
    assert final["needs_approval"] is False


def test_live_run_rehydrates_as_interrupted(client, tmp_path):
    import sqlite3
    from app.api.runs import _runs_db
    pid = _create(client)
    _runs_db(tmp_path).close()  # schema only; rows below simulate a crash
    db = sqlite3.connect(str(tmp_path / "runs.db"))
    try:
        db.execute("INSERT OR REPLACE INTO runs "
                   "(run_id, project_id, status, events_json, error, "
                   "updated_at, mode) VALUES (?,?,?,?,?,?,?)",
                   ("r-dead", pid, "running", "[]", None, "t", "research"))
        db.execute("INSERT OR REPLACE INTO runs "
                   "(run_id, project_id, status, events_json, error, "
                   "updated_at, mode) VALUES (?,?,?,?,?,?,?)",
                   ("r-junk", pid, "running", "not-json{{{", None, "t",
                    "research"))
        db.commit()
    finally:
        db.close()
    assert rehydrate_runs(tmp_path) == 1  # corrupt row skipped, not fatal
    dead = client.get(f"/api/v1/lab-projects/{pid}/runs/r-dead").json()
    assert dead["status"] == "interrupted"
    assert client.post(f"/api/v1/lab-projects/{pid}/runs/r-dead/approve",
                       json={}).status_code == 400
    assert client.get(f"/api/v1/lab-projects/{pid}/runs/r-junk").status_code == 404
    # File-level corruption (garbage bytes, not rows) must never kill boot:
    (tmp_path / "runs.db").write_bytes(b"\x00\x01garbage-not-sqlite")
    assert rehydrate_runs(tmp_path) == 0
    with TestClient(create_app(tmp_path)):  # lifespan rehydrates on boot
        pass


def test_approve_after_restart_with_tampered_config_400s(client, tmp_path):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    runs_mod._runs.clear()
    clear_graph_cache()
    assert rehydrate_runs(tmp_path) >= 1
    # Tamper project.yaml: judge overlaps a council model (self-preference).
    store = LabProjectStore(tmp_path, pid)
    meta = store.read_meta()
    meta.judge_model = meta.council_models["scientist"]
    store.write_meta(meta)
    resp = client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                       json={"decision": "approve"})
    assert resp.status_code == 400, resp.text
    # No phantom approval decision recorded for a run that never resumed:
    ids = [d.id for d in LabProjectStore(tmp_path, pid).list_decisions()]
    assert f"D-approve-{rid}" not in ids


def test_patch_models_persists_and_validates(client, tmp_path):
    pid = _create(client)
    body = {"council_models": {"scientist": "a", "investigator": "b",
                               "skeptic": "c"},
            "judge_model": "j"}
    updated = client.patch(f"/api/v1/lab-projects/{pid}", json=body)
    assert updated.status_code == 200, updated.text
    got = client.get(f"/api/v1/lab-projects/{pid}").json()
    assert got["council_models"]["scientist"] == "a"
    assert got["judge_model"] == "j"
    # Partial update keeps the rest:
    partial = client.patch(f"/api/v1/lab-projects/{pid}",
                           json={"judge_model": "j2"})
    assert partial.status_code == 200
    assert partial.json()["council_models"]["scientist"] == "a"
    # Overlap refused with a readable reason (UI surfaces it verbatim):
    bad = client.patch(f"/api/v1/lab-projects/{pid}",
                       json={"judge_model": "a"})
    assert bad.status_code == 400 and "self-preference" in bad.text
    # ...and nothing was mutated by the refused PATCH:
    assert client.get(f"/api/v1/lab-projects/{pid}").json()["judge_model"] == "j2"
    # Blank model IDs refused (would corrupt runs downstream):
    blank = client.patch(f"/api/v1/lab-projects/{pid}",
                         json={"judge_model": "  "})
    assert blank.status_code == 400 and "Blank model IDs" in blank.text
    assert client.patch("/api/v1/lab-projects/ghost",
                        json=body).status_code == 404
    assert not (tmp_path / "ghost").exists()  # no mkdir side effect


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


# --- PBI-052: edit-and-continue ---

def test_edit_replaces_draft_and_resumes(client, tmp_path):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    draft_before = client.get(
        f"/api/v1/lab-projects/{pid}/output/report").json()["markdown"]
    assert "# T" in draft_before  # synthesis draft exists pre-edit
    edited = "# T\n\nHuman rewritten conclusions.\n"
    resp = client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                       json={"decision": "edit",
                             "edited_content": edited,
                             "note": "tighten"})
    assert resp.json() == {"run_id": rid, "status": "running"}
    # The edited draft is what ships (observable downstream effect).
    assert client.get(
        f"/api/v1/lab-projects/{pid}/output/report").json()["markdown"] \
        == edited
    assert (tmp_path / pid / "debates" / f"approval-edit-{rid}.md"
            ).read_text(encoding="utf-8") == edited
    store = LabProjectStore(tmp_path, pid)
    assert store.read_decision(f"D-edit-{rid}").what == \
        "Human edited synthesis draft at checkpoint"
    final = _wait_for(client, pid, rid, {"done"})
    assert final["needs_approval"] is False


def test_edit_validation(client):
    pid = _create(client)
    rid = client.post(f"/api/v1/lab-projects/{pid}/runs",
                      json={}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    base = f"/api/v1/lab-projects/{pid}/runs/{rid}/approve"
    assert client.post(base, json={"decision": "edit"}).status_code == 422
    assert client.post(
        base, json={"decision": "edit",
                    "edited_content": "   "}).status_code == 422
    assert client.post(
        base, json={"decision": "maybe"}).status_code == 422
    # run still paused and intact after rejected edits
    assert client.get(
        f"/api/v1/lab-projects/{pid}/runs/{rid}").json()["status"] == \
        "awaiting_approval"
