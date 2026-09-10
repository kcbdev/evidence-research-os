"""PBI-015 gate: filterable claims view, trace detail, decisions,
budget honesty, report serving, regenerate-not-maintain proof."""
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.models.evidence import (Claim, Confidence, Evidence, ProjectMeta,
                                 Source)
from app.store.lab_project import LabProjectStore

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m", "investigator": "m", "skeptic": "m"}


def _conf(overall):
    return Confidence(source_quality=overall, methodological_strength=overall,
                      independent_confirmation=overall,
                      contradiction_level=0.0, overall=overall)


@pytest.fixture()
def seeded(tmp_path, monkeypatch):
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(ProjectMeta(id="p", title="t", question="q",
                                 created_at=TS, council_models=COUNCIL,
                                 judge_model="mj"))
    store.write_source(Source(id="S-1", kind="primary_paper",
                              url="https://e.org/1", title="t1",
                              retrieved_at=TS, quality_tier=2))
    store.write_source(Source(id="S-2", kind="journalism",
                              url="https://e.org/2", title="t2",
                              retrieved_at=TS, quality_tier=6))
    store.write_claim(Claim(id="C-high", statement="strong",
                            supporting_sources=["S-1"], status="SUPPORTED",
                            confidence=_conf(0.9)))
    store.write_claim(Claim(id="C-low", statement="weak",
                            supporting_sources=["S-2"],
                            opposing_sources=["S-1"], status="DISPUTED",
                            confidence=_conf(0.3)))
    store.write_evidence(Evidence(id="E-1", source_id="S-1",
                                  location={"section": "R"},
                                  text_reference="gains", supports=["C-high"],
                                  evidence_type="empirical", strength="high"))
    client = TestClient(create_app(tmp_path))
    return client, store


def test_claims_filters(seeded):
    client, _ = seeded
    all_rows = client.get("/api/v1/lab-projects/p/claims").json()
    assert [r["id"] for r in all_rows] == ["C-high", "C-low"]
    assert [r["id"] for r in client.get(
        "/api/v1/lab-projects/p/claims",
        params={"status": "DISPUTED"}).json()] == ["C-low"]
    assert [r["id"] for r in client.get(
        "/api/v1/lab-projects/p/claims",
        params={"min_confidence": 0.5}).json()] == ["C-high"]
    assert [r["id"] for r in client.get(
        "/api/v1/lab-projects/p/claims",
        params={"contradictions_only": True}).json()] == ["C-low"]
    assert [r["id"] for r in client.get(
        "/api/v1/lab-projects/p/claims",
        params={"status": "SUPPORTED,DISPUTED",
                "min_confidence": 0.5}).json()] == ["C-high"]
    # The card's own example: DISPUTED with confidence BELOW 0.5.
    assert [r["id"] for r in client.get(
        "/api/v1/lab-projects/p/claims",
        params={"status": "DISPUTED",
                "max_confidence": 0.5}).json()] == ["C-low"]
    assert client.get("/api/v1/lab-projects/p/claims",
                      params={"status": "NOPE"}).json() == []
    assert [r["id"] for r in client.get(
        "/api/v1/lab-projects/p/claims",
        params={"status": "SUPPORTED,DISPUTED",
                "contradictions_only": True}).json()] == ["C-low"]


def test_unknown_project_creates_nothing(seeded):
    client, store = seeded
    assert client.get("/api/v1/lab-projects/ghost/claims").status_code == 404
    assert not (store.path.parent / "ghost").exists()  # no mkdir side effect


def test_claim_detail_trace(seeded):
    client, _ = seeded
    body = client.get("/api/v1/lab-projects/p/claims/C-high").json()
    assert body["claim"]["statement"] == "strong"
    assert [e["id"] for e in body["evidence"]] == ["E-1"]
    assert {s["id"] for s in body["sources"]} == {"S-1"}
    disputed = client.get("/api/v1/lab-projects/p/claims/C-low").json()
    assert {s["id"] for s in disputed["sources"]} == {"S-1", "S-2"}
    assert client.get("/api/v1/lab-projects/p/claims/C-nope").status_code == 404


def test_view_regenerates_not_maintained(seeded):
    client, store = seeded
    assert len(client.get("/api/v1/lab-projects/p/claims").json()) == 2
    (store.path / "claims" / "C-low.yaml").unlink()  # bypass the store
    rows = client.get("/api/v1/lab-projects/p/claims").json()
    assert [r["id"] for r in rows] == ["C-high"]  # deletion reflected
    claim = store.read_claim("C-high")
    claim.status = "DISPUTED"
    store.write_claim(claim)
    rows = client.get("/api/v1/lab-projects/p/claims",
                      params={"status": "DISPUTED"}).json()
    assert [r["id"] for r in rows] == ["C-high"]  # edit reflected


def test_decisions_budget_report(seeded):
    client, store = seeded
    from app.models.evidence import Decision
    store.write_decision(Decision(id="D-1", what="w", why="y", timestamp=TS))
    assert [d["id"] for d in client.get(
        "/api/v1/lab-projects/p/decisions").json()] == ["D-1"]
    budget = client.get("/api/v1/lab-projects/p/budget").json()
    assert (budget["max_model_calls"], budget["calls_used"],
            budget["exhausted"]) == (50, 0, False)
    assert "cost" not in budget  # no invented pricing model
    assert client.get("/api/v1/lab-projects/p/output/report").status_code == 404
    (store.path / "output").mkdir(exist_ok=True)
    (store.path / "output" / "report.md").write_text("# R\n")
    body = client.get("/api/v1/lab-projects/p/output/report").json()
    assert body["markdown"] == "# R\n"  # PBI-049 envelope
    assert body["generated_at"]  # mtime-derived


def test_tasks_filter_by_claim(seeded):
    from app.models.evidence import Task
    client, store = seeded
    # Seeded fixture (C-high/C-low) has no tasks yet:
    assert client.get("/api/v1/lab-projects/p/tasks").json() == []
    store.write_task(Task(id="T-C-low", question="Adjudicate: weak",
                          reason="challenge", assigned_agent="investigator"))
    store.write_task(Task(id="T-other", question="unrelated chore",
                          reason="r", assigned_agent="scientist"))
    by_id = client.get("/api/v1/lab-projects/p/tasks",
                       params={"claim_id": "C-low"}).json()
    assert [t["id"] for t in by_id] == ["T-C-low"]
    assert client.get("/api/v1/lab-projects/p/tasks",
                      params={"claim_id": "C-high"}).json() == []
    assert client.get("/api/v1/lab-projects/p/tasks",
                      params={"claim_id": "C-nope"}).status_code == 404
    # Branch isolation: statement-fallback WITHOUT id convention...
    store.write_task(Task(id="T-custom-7", question="Adjudicate: weak",
                          reason="r", assigned_agent="scientist"))
    assert [t["id"] for t in client.get(
        "/api/v1/lab-projects/p/tasks",
        params={"claim_id": "C-low"}).json()] == ["T-C-low", "T-custom-7"]
    # ...and id-match WITHOUT statement presence:
    store.write_task(Task(id="T-C-high", question="totally unrelated",
                          reason="r", assigned_agent="scientist"))
    assert [t["id"] for t in client.get(
        "/api/v1/lab-projects/p/tasks",
        params={"claim_id": "C-high"}).json()] == ["T-C-high"]
    # Unfiltered queue lists everything:
    assert len(client.get("/api/v1/lab-projects/p/tasks").json()) == 4
