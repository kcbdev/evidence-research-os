"""PBI-045 gate: graph endpoint neighborhoods + filter."""
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.main import create_app
from app.models.evidence import Claim, Evidence, ProjectMeta, Source
from app.store.lab_project import LabProjectStore

TS = "2026-09-05T10:00:00Z"
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


def _seed(tmp_path):
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(
        id="p", title="t", question="q", created_at=TS,
        council_models=COUNCIL, judge_model=JUDGE))
    store.write_source(Source(
        id="S-1", kind="primary_paper", url="https://e.org/1",
        title="supporting paper", retrieved_at=TS, quality_tier=2))
    store.write_source(Source(
        id="S-2", kind="journalism", url="https://e.org/2",
        title="opposing article", retrieved_at=TS, quality_tier=7))
    store.write_claim(Claim(
        id="C-1", statement="strong", supporting_sources=["S-1"],
        opposing_sources=["S-2"], status="DISPUTED"))
    store.write_claim(Claim(id="C-2", statement="lonely"))
    store.write_evidence(Evidence(
        id="E-1", source_id="S-1", location={"section": "R"},
        text_reference="gains", supports=["C-1"],
        evidence_type="empirical", strength="high"))
    # Dangling source link: node absent AND no edge may point at it.
    store.write_evidence(Evidence(
        id="E-2", source_id="S-gone", location={"section": "R"},
        text_reference="hearsay", supports=["C-1"],
        evidence_type="argumentative", strength="low"))


def test_full_neighborhood(client, tmp_path):
    _seed(tmp_path)
    body = client.get("/api/v1/lab-projects/p/graph").json()
    by_id = {n["id"]: n for n in body["nodes"]}
    assert set(by_id) == {"C-1", "C-2", "S-1", "S-2", "E-1", "E-2"}
    assert by_id["C-1"]["status"] == "DISPUTED"
    assert by_id["S-1"]["url"] == "https://e.org/1"
    assert by_id["E-1"]["excerpt"] == "gains"
    rels = {(e["from"], e["to"], e["relation"]) for e in body["edges"]}
    assert ("E-1", "C-1", "supports") in rels
    assert ("S-2", "C-1", "contradicts") in rels
    assert ("S-1", "E-1", "references") in rels
    # Lonely claim: node present, no edges.
    assert not [e for e in body["edges"] if "C-2" in (e["from"], e["to"])]
    # Dangling evidence: node present, edges only to real nodes.
    assert "E-2" in by_id
    assert not [e for e in body["edges"] if "S-gone" in (e["from"], e["to"])]
    assert ("E-2", "C-1", "supports") in rels


def test_status_filter_restricts_to_neighborhood(client, tmp_path):
    _seed(tmp_path)
    body = client.get("/api/v1/lab-projects/p/graph",
                      params={"status_filter": "DISPUTED"}).json()
    assert {n["id"] for n in body["nodes"]} == {"C-1", "S-1", "S-2",
                                               "E-1", "E-2"}
    assert all("C-2" not in (e["from"], e["to"]) for e in body["edges"])
    assert client.get("/api/v1/lab-projects/p/graph",
                      params={"status_filter": "SUPPORTED"}).json() == \
        {"nodes": [], "edges": []}
    assert client.get("/api/v1/lab-projects/ghost/graph").status_code == 404
