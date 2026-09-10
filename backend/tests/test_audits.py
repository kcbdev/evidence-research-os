"""PBI-040 gate: audits API over HTTP (latest + rerun).

Mocks at the citation_verify seam (fetch + auditor); store, routers,
and persistence are real.
"""
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


def _create(client):
    resp = client.post("/api/v1/lab-projects",
                       json={"title": "T", "question": "q",
                             "council_models": COUNCIL,
                             "judge_model": JUDGE})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _seed_pair(tmp_path, pid):
    store = LabProjectStore(tmp_path, pid)
    store.write_source(Source(
        id="S-1", kind="primary_paper", url="https://e.org/1",
        title="t", retrieved_at=TS, quality_tier=2))
    store.write_claim(Claim(
        id="C-1", statement="microbe Y causes effect X",
        supporting_sources=["S-1"], opposing_sources=[]))
    store.write_evidence(Evidence(
        id="E-1", source_id="S-1", location={"section": "methods"},
        text_reference="mentions microbes in passing", supports=["C-1"],
        evidence_type="empirical", strength="high"))


def _mock_verify(monkeypatch, auditor_text="FAIL — merely topical."):
    monkeypatch.setattr("app.tools.citation_verify.cached_fetch_url",
                        lambda *a, **k: "results and discussion")
    monkeypatch.setattr("app.tools.citation_verify.call_model_resilient",
                        lambda *a, **k: (auditor_text, 1))
    monkeypatch.setattr("app.tools.citation_verify.resolve_auditor",
                        lambda *a, **k: "m-aud")


def test_latest_empty_before_any_run(client):
    pid = _create(client)
    body = client.get(f"/api/v1/lab-projects/{pid}/audits/latest").json()
    assert body == {"audit_run_id": None, "results": []}


def test_rerun_then_latest_with_filters(client, tmp_path, monkeypatch):
    pid = _create(client)
    _seed_pair(tmp_path, pid)
    _mock_verify(monkeypatch)
    rerun = client.post(f"/api/v1/lab-projects/{pid}/audits/rerun",
                        json={}).json()
    assert rerun["rows"] == 1 and rerun["failed"] is True
    latest = client.get(
        f"/api/v1/lab-projects/{pid}/audits/latest").json()
    assert latest["audit_run_id"] == rerun["audit_run_id"]
    assert len(latest["results"]) == 3  # existence/pincite/support
    stages = {r["stage"]: r["status"] for r in latest["results"]}
    assert stages == {"existence": "PASS", "pincite": "WARNING",
                      "support_match": "FAIL"}
    fails = client.get(f"/api/v1/lab-projects/{pid}/audits/latest",
                       params={"status": "FAIL"}).json()
    assert [r["stage"] for r in fails["results"]] == ["support_match"]
    scoped = client.get(f"/api/v1/lab-projects/{pid}/audits/latest",
                        params={"claim_id": "C-nope"}).json()
    assert scoped["results"] == []
    bad = client.get(f"/api/v1/lab-projects/{pid}/audits/latest",
                     params={"status": "BOGUS"})
    assert bad.status_code == 422


def test_rerun_scoped_to_claim(client, tmp_path, monkeypatch):
    pid = _create(client)
    _seed_pair(tmp_path, pid)
    store = LabProjectStore(tmp_path, pid)
    store.write_claim(Claim(id="C-2", statement="other",
                            supporting_sources=[], opposing_sources=[]))
    _mock_verify(monkeypatch)
    rerun = client.post(f"/api/v1/lab-projects/{pid}/audits/rerun",
                        json={"claim_id": "C-2"}).json()
    assert rerun["rows"] == 0 and rerun["failed"] is False
    latest = client.get(
        f"/api/v1/lab-projects/{pid}/audits/latest").json()
    assert latest["results"] == []
    missing = client.post(f"/api/v1/lab-projects/{pid}/audits/rerun",
                          json={"claim_id": "C-nope"})
    assert missing.status_code == 404
