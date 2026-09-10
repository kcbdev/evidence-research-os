"""PBI-049 gate: product-notes API over HTTP."""
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.main import create_app

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


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


def _create(client):
    resp = client.post("/api/v1/lab-projects",
                       json={"title": "T", "question": "q",
                             "council_models": COUNCIL,
                             "judge_model": JUDGE})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_product_note_round_trip(client):
    pid = _create(client)
    assert client.get(
        f"/api/v1/lab-projects/{pid}/product-notes").json() == []
    created = client.post(
        f"/api/v1/lab-projects/{pid}/product-notes",
        json={"note": "ship the microbe finding", "linked_area": "runfusion"})
    assert created.status_code == 201
    body = created.json()
    assert body["id"] == "N-001"
    assert body["lab_project_id"] == pid
    assert body["linked_area"] == "runfusion"
    assert body["created_at"]
    listed = client.get(
        f"/api/v1/lab-projects/{pid}/product-notes").json()
    assert [n["id"] for n in listed] == ["N-001"]
    second = client.post(
        f"/api/v1/lab-projects/{pid}/product-notes",
        json={"note": "second"}).json()
    assert second["id"] == "N-002"
    assert second["linked_area"] is None


def test_empty_note_422s(client):
    pid = _create(client)
    for bad in ({}, {"note": ""}, {"note": "   "}):
        resp = client.post(f"/api/v1/lab-projects/{pid}/product-notes",
                           json=bad)
        assert resp.status_code == 422
    assert client.post(f"/api/v1/lab-projects/{pid}/product-notes",
                       json={"note": "x"}).status_code == 201
    assert client.get(
        f"/api/v1/lab-projects/ghost/product-notes").status_code == 404
