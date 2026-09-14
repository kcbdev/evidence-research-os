"""PBI-083 gate: recorded claim→section order honored verbatim,
absence reproduces legacy behavior exactly, API validates + persists.
"""
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.graph import nodes
from app.main import create_app
from app.models.evidence import BudgetState, Claim, ProjectMeta
from app.store.lab_project import LabProjectStore

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _seed(tmp_path):
    store = LabProjectStore(tmp_path, "p")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    store.write_meta(ProjectMeta(
        id="p", title="Bone Study", question="does D help?",
        created_at=TS, council_models=COUNCIL, judge_model=JUDGE))
    return store


def _state():
    return {"lab_project_id": "p", "mode": "research",
            "active_question": "q", "budget": BudgetState(),
            "pending_tasks": [], "open_contradictions": [],
            "escalate": True, "audit_passed": True,
            "needs_human_approval": False, "session_id": "s-1",
            "first_pass": {}}


def _seed_claims(store):
    for cid, stmt in (("C-1", "first"), ("C-2", "second"),
                      ("C-3", "third")):
        store.write_claim(Claim(id=cid, statement=stmt,
                                status="SUPPORTED",
                                adjudicated_by=JUDGE))


def _report(tmp_path):
    return (tmp_path / "p" / "output" / "report.md").read_text(
        encoding="utf-8")


def test_absent_structure_reproduces_legacy(tmp_path):
    store = _seed(tmp_path)
    _seed_claims(store)
    nodes.make_synthesis(tmp_path)(_state())
    report = _report(tmp_path)
    assert "## Adjudicated claims" in report
    assert report.index("C-1 — SUPPORTED") < \
        report.index("C-2 — SUPPORTED") < \
        report.index("C-3 — SUPPORTED")


def test_legacy_output_is_byte_exact(tmp_path):
    # Golden pin: the legacy render is byte-identical, not just
    # order-correct (PBI-083 refactor guard).
    store = _seed(tmp_path)
    _seed_claims(store)
    nodes.make_synthesis(tmp_path)(_state())
    assert _report(tmp_path) == (
        "# Bone Study\n"
        "\n"
        "Question: does D help?\n"
        "\n"
        "## Adjudicated claims\n"
        "\n"
        "### C-1 — SUPPORTED\n"
        "\n"
        "first\n"
        "\n"
        "Confidence: 0.00 | Adjudicated by: m-judge\n"
        "Supporting: — | Opposing: —\n"
        "\n"
        "### C-2 — SUPPORTED\n"
        "\n"
        "second\n"
        "\n"
        "Confidence: 0.00 | Adjudicated by: m-judge\n"
        "Supporting: — | Opposing: —\n"
        "\n"
        "### C-3 — SUPPORTED\n"
        "\n"
        "third\n"
        "\n"
        "Confidence: 0.00 | Adjudicated by: m-judge\n"
        "Supporting: — | Opposing: —\n"
        "\n"
        "## Pending review (not cited above)\n"
        "\n"
        "(none)\n"
    )


def test_corrupted_structure_falls_back_to_legacy(tmp_path):
    store = _seed(tmp_path)
    _seed_claims(store)
    out_dir = tmp_path / "p" / "output"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "structure.yaml").write_text(
        "::: not yaml ::: [unclosed", encoding="utf-8")
    nodes.make_synthesis(tmp_path)(_state())
    assert "## Adjudicated claims" in _report(tmp_path)
    (out_dir / "structure.yaml").write_text(
        "- just\n- a\n- list\n", encoding="utf-8")
    nodes.make_synthesis(tmp_path)(_state())
    assert "## Adjudicated claims" in _report(tmp_path)


def test_recorded_order_honored_verbatim(tmp_path):
    store = _seed(tmp_path)
    _seed_claims(store)
    store.write_report_structure([
        {"title": "Counter-evidence", "claim_ids": ["C-3"]},
        {"title": "Main findings", "claim_ids": ["C-1", "C-2"]},
    ])
    nodes.make_synthesis(tmp_path)(_state())
    report = _report(tmp_path)
    assert "## Adjudicated claims" not in report
    assert report.index("## Counter-evidence") < \
        report.index("## Main findings")
    assert report.index("C-3 — SUPPORTED") < \
        report.index("C-1 — SUPPORTED") < \
        report.index("C-2 — SUPPORTED")


def test_unlisted_claims_appended_never_dropped(tmp_path):
    store = _seed(tmp_path)
    _seed_claims(store)
    store.write_report_structure([
        {"title": "Spotlight", "claim_ids": ["C-2", "C-nope"]},
    ])
    nodes.make_synthesis(tmp_path)(_state())
    report = _report(tmp_path)
    assert "## Spotlight" in report
    assert "C-2 — SUPPORTED" in report
    # Unknown ids skipped, unlisted adjudicated claims appended.
    assert "C-nope" not in report
    assert "## Additional claims" in report
    assert "C-1 — SUPPORTED" in report and "C-3 — SUPPORTED" in report


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


def test_structure_api_validates_claim_ids(client, tmp_path, monkeypatch):
    pid = _create(client)
    assert client.get(
        f"/api/v1/lab-projects/{pid}/output/structure").json() == \
        {"sections": None}
    store = LabProjectStore(tmp_path, pid)
    store.write_claim(Claim(id="C-1", statement="s"))
    ghost = client.put(f"/api/v1/lab-projects/{pid}/output/structure",
                       json={"sections": [
                           {"title": "S", "claim_ids": ["C-ghost"]}]})
    assert ghost.status_code == 422 and "C-ghost" in ghost.text
    untitled = client.put(
        f"/api/v1/lab-projects/{pid}/output/structure",
        json={"sections": [{"title": "", "claim_ids": ["C-1"]}]})
    assert untitled.status_code == 422
    blank = client.put(
        f"/api/v1/lab-projects/{pid}/output/structure",
        json={"sections": [{"title": "   ", "claim_ids": ["C-1"]}]})
    assert blank.status_code == 422
    multiline = client.put(
        f"/api/v1/lab-projects/{pid}/output/structure",
        json={"sections": [{"title": "A\n## B", "claim_ids": ["C-1"]}]})
    assert multiline.status_code == 422
    reserved = client.put(
        f"/api/v1/lab-projects/{pid}/output/structure",
        json={"sections": [
            {"title": "Additional claims", "claim_ids": ["C-1"]}]})
    assert reserved.status_code == 422
    store.write_claim(Claim(id="C-2", statement="t"))
    dup = client.put(
        f"/api/v1/lab-projects/{pid}/output/structure",
        json={"sections": [{"title": "A", "claim_ids": ["C-1"]},
                           {"title": "B", "claim_ids": ["C-1", "C-2"]}]})
    assert dup.status_code == 422 and "C-1" in dup.text
    ok = client.put(f"/api/v1/lab-projects/{pid}/output/structure",
                    json={"sections": [
                        {"title": "Findings", "claim_ids": ["C-1"]}]})
    assert ok.status_code == 200
    assert ok.json() == {"sections": [
        {"title": "Findings", "claim_ids": ["C-1"]}]}
    assert client.get(
        f"/api/v1/lab-projects/{pid}/output/structure").json() == ok.json()


def test_structure_api_clear_restores_legacy(client, tmp_path):
    pid = _create(client)
    store = LabProjectStore(tmp_path, pid)
    store.write_claim(Claim(id="C-1", statement="s"))
    put = f"/api/v1/lab-projects/{pid}/output/structure"
    assert client.put(put, json={"sections": [
        {"title": "S", "claim_ids": ["C-1"]}]}).status_code == 200
    cleared = client.put(put, json={"sections": []})
    assert cleared.status_code == 200 and cleared.json() == \
        {"sections": None}
    assert client.get(put).json() == {"sections": None}
    # Clearing twice is a no-op, never a 404.
    assert client.put(put, json={"sections": []}).status_code == 200


def test_corrupted_structure_reads_as_absent(client, tmp_path):
    pid = _create(client)
    out_dir = tmp_path / pid / "output"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "structure.yaml").write_text(
        "::: not yaml ::: [unclosed", encoding="utf-8")
    assert client.get(
        f"/api/v1/lab-projects/{pid}/output/structure").json() == \
        {"sections": None}
