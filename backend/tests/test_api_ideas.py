"""PBI-036 gate: Ideas API over HTTP.

Store-seeded ideas, no graph needed. Verifies list/filter, PATCH
promote/reject, 422/404 shapes.
"""
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.main import create_app
from app.store.lab_project import LabProjectStore
from app.models.evidence import Idea, ProjectMeta

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv",
           "skeptic": "m-ske", "ideator": "m-ide"}
JUDGE = "m-judge"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    monkeypatch.setattr("app.agents.ideator.call_model_resilient",
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
               "council_models": dict(COUNCIL), "judge_model": JUDGE}
    payload.update(over)
    resp = client.post("/api/v1/lab-projects", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _seed_ideas(tmp_path, project_id):
    store = LabProjectStore(tmp_path, project_id)
    store.write_meta(ProjectMeta(
        id=project_id, title="T", question="q",
        created_at="2026-09-05T10:00:00Z",
        council_models=COUNCIL, judge_model=JUDGE))
    store.write_idea(Idea(id="I-001", statement="first angle",
                          status="proposed"))
    store.write_idea(Idea(id="I-002", statement="second angle",
                          status="under_skeptic_review"))
    store.write_idea(Idea(id="I-003", statement="third angle",
                          status="rejected"))
    return ["I-001", "I-002", "I-003"]


def test_list_ideas_no_filter(client, tmp_path):
    pid = _create(client)
    _seed_ideas(tmp_path, pid)
    resp = client.get(f"/api/v1/lab-projects/{pid}/ideas")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    ids = {i["id"] for i in data}
    assert ids == {"I-001", "I-002", "I-003"}


def test_list_ideas_status_filter(client, tmp_path):
    pid = _create(client)
    _seed_ideas(tmp_path, pid)
    resp = client.get(f"/api/v1/lab-projects/{pid}/ideas",
                      params={"status": "proposed"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "I-001"


def test_patch_idea_reject(client, tmp_path):
    pid = _create(client)
    _seed_ideas(tmp_path, pid)
    resp = client.patch(f"/api/v1/lab-projects/{pid}/ideas/I-001",
                        json={"status": "rejected"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    # verify persisted via list (I-003 was already rejected)
    resp2 = client.get(f"/api/v1/lab-projects/{pid}/ideas",
                       params={"status": "rejected"})
    data = resp2.json()
    assert len(data) == 2
    ids = {i["id"] for i in data}
    assert ids == {"I-001", "I-003"}


def test_patch_idea_promote_creates_claim(client, tmp_path):
    pid = _create(client)
    _seed_ideas(tmp_path, pid)
    resp = client.patch(f"/api/v1/lab-projects/{pid}/ideas/I-002",
                        json={"status": "promoted_to_claim"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "promoted_to_claim"
    assert "created_claim_id" in data
    claim_id = data["created_claim_id"]
    assert claim_id.startswith("C-")
    # verify claim exists and links back to the idea (provenance)
    resp2 = client.get(f"/api/v1/lab-projects/{pid}/claims/{claim_id}")
    assert resp2.status_code == 200
    assert resp2.json()["claim"]["statement"] == "second angle"
    assert resp2.json()["claim"]["promoted_from_idea"] == "I-002"
    # idea status updated via list
    resp3 = client.get(f"/api/v1/lab-projects/{pid}/ideas",
                       params={"status": "promoted_to_claim"})
    data = resp3.json()
    assert len(data) == 1
    assert data[0]["id"] == "I-002"


def test_promote_guards(client, tmp_path):
    pid = _create(client)
    _seed_ideas(tmp_path, pid)
    url = f"/api/v1/lab-projects/{pid}/ideas/I-001"
    assert client.patch(url, json={"status": "promoted_to_claim"}
                        ).status_code == 200
    # Re-promote mints nothing: 409, claim count stays 1.
    assert client.patch(url, json={"status": "promoted_to_claim"}
                        ).status_code == 409
    assert len(client.get(
        f"/api/v1/lab-projects/{pid}/claims").json()) == 1
    # Reject-after-promote is allowed (reconsideration); the claim stays.
    assert client.patch(url, json={"status": "rejected"}).status_code == 200
    assert len(client.get(
        f"/api/v1/lab-projects/{pid}/claims").json()) == 1
    # Reject is idempotent (no extra commit churn asserted here —
    # status simply stays rejected).
    assert client.patch(url, json={"status": "rejected"}
                        ).json()["status"] == "rejected"


def test_patch_invalid_status_422(client, tmp_path):
    pid = _create(client)
    _seed_ideas(tmp_path, pid)
    resp = client.patch(f"/api/v1/lab-projects/{pid}/ideas/I-001",
                        json={"status": "bogus"})
    assert resp.status_code == 422


def test_patch_unknown_idea_404(client, tmp_path):
    pid = _create(client)
    _seed_ideas(tmp_path, pid)
    resp = client.patch(f"/api/v1/lab-projects/{pid}/ideas/I-999",
                        json={"status": "rejected"})
    assert resp.status_code == 404