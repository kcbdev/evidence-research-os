"""PBI-046 gate: GET /search over the shared index."""
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.main import create_app
from app.models.evidence import Claim, ProjectMeta
from app.store.lab_project import LabProjectStore
from app.tools.semantic_index import backfill_shared_index

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _fake_embed(text: str) -> list[float]:
    t = text.lower()
    return [float("microbe" in t), float("quantum" in t)]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tools.semantic_index.embed", _fake_embed)
    monkeypatch.setattr("app.tools.semantic_index._get_embedder",
                        lambda: (_ for _ in ()).throw(
                            AssertionError("model download attempted")))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    runs_mod._runs.clear()
    with TestClient(create_app(tmp_path)) as client:
        yield client
    clear_graph_cache()
    runs_mod._runs.clear()


def _project(tmp_path, pid, title, statement):
    store = LabProjectStore(tmp_path, pid)
    store.write_meta(ProjectMeta(
        id=pid, title=title, question="q", created_at=TS,
        council_models=COUNCIL, judge_model=JUDGE))
    store.write_claim(Claim(id="C-1", statement=statement))


def test_search_empty_index(tmp_path):
    # No table at all → [], never 500 (fresh installs).
    from fastapi.testclient import TestClient as TC
    from app.main import create_app as ca
    with TC(ca(tmp_path)) as c:
        assert c.get("/api/v1/search", params={"q": "x"}).json() == []


def test_search_spans_projects(client, tmp_path):
    _project(tmp_path, "pa", "Alpha", "microbe Y causes effect X")
    _project(tmp_path, "pb", "Beta", "quantum barnacles migrate")
    assert sorted(backfill_shared_index(tmp_path)) == ["pa", "pb"]
    body = client.get("/api/v1/search", params={"q": "microbe"}).json()
    assert body[0]["project_id"] == "pa"
    assert body[0]["project_title"] == "Alpha"
    assert body[0]["claim_id"] == "C-1"
    assert "microbe" in body[0]["matching_text"]
    assert 0.0 < body[0]["score"] <= 1.0
    # Empty query 422s; limit clamps rather than exploding.
    assert client.get("/api/v1/search",
                      params={"q": "  "}).status_code == 422
    assert len(client.get("/api/v1/search",
                          params={"q": "microbe",
                                  "limit": 1000}).json()) <= 100
