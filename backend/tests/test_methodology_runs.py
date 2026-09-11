"""PBI-056 gate: methodology selection end to end.

Resolution, precedence, budget chain, record/history carriage —
over HTTP where behavior lives, direct unit where the chain lives.
"""
import time
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import (_resolve_budget, clear_graph_cache,
                          rehydrate_runs, resolve_methodology)
from app.main import create_app
from app.models.evidence import BudgetState, ProjectMeta
from app.store.lab_project import LabProjectStore
from app.store.methodology import MethodologyStore

COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    monkeypatch.setattr("app.agents.ideator.call_model_resilient",
                        lambda *a, **k: ("IDEA: x\n", 1))
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
    return resp.json()


def _wait_for(client, pid, rid, want, deadline=30.0):
    end = time.time() + deadline
    while time.time() < end:
        status = client.get(f"/api/v1/lab-projects/{pid}/runs/{rid}").json()
        if status["status"] in want:
            return status
        time.sleep(0.2)
    raise AssertionError(f"run {rid} never reached {want}")


def test_explicit_methodology_selects_pipeline(client):
    pid = _create(client)["id"]
    body = client.post(f"/api/v1/lab-projects/{pid}/runs",
                       json={"methodology_id": "brainstorm-ideation-v1",
                             "mode": "brainstorm"}).json()
    assert body["methodology_id"] == "brainstorm-ideation-v1"
    rid = body["run_id"]
    final = _wait_for(client, pid, rid, {"awaiting_approval"})
    assert final["methodology_id"] == "brainstorm-ideation-v1"
    assert "novelty_check" in [e["node"] for e in final["events"]]
    rows = client.get(f"/api/v1/lab-projects/{pid}/runs").json()
    assert rows[0]["methodology_id"] == "brainstorm-ideation-v1"


def test_unknown_methodology_404s(client):
    pid = _create(client)["id"]
    resp = client.post(f"/api/v1/lab-projects/{pid}/runs",
                       json={"methodology_id": "ghost-v9"})
    assert resp.status_code == 404
    assert client.post("/api/v1/lab-projects",
                       json={"title": "T", "question": "q",
                             "methodology_id": "ghost-v9"}
                       ).status_code == 404


def test_project_pin_and_create_overrides(client, tmp_path):
    created = _create(client, methodology_id="brainstorm-ideation-v1",
                      mode="brainstorm",
                      budget_overrides={"max_model_calls": 33})
    assert created["methodology_id"] == "brainstorm-ideation-v1"
    assert created["budget"]["max_model_calls"] == 33
    assert created["budget"]["max_research_rounds"] == 5
    pid = created["id"]
    # No explicit id → project pin wins over mode default.
    body = client.post(f"/api/v1/lab-projects/{pid}/runs",
                       json={}).json()
    assert body["methodology_id"] == "brainstorm-ideation-v1"
    bad = client.post("/api/v1/lab-projects",
                      json={"title": "T", "question": "q",
                            "budget_overrides": {"max_model_calls": 0}})
    assert bad.status_code == 422


def test_auto_models_fall_back_to_methodology(client):
    # Bare project (auto/auto everywhere) + real default methodology:
    # fail-closed does NOT trigger — unset means inherit.
    resp = client.post("/api/v1/lab-projects",
                       json={"title": "T", "question": "q"})
    pid = resp.json()["id"]
    body = client.post(f"/api/v1/lab-projects/{pid}/runs",
                       json={}).json()
    assert body["methodology_id"] == "deep-research-council-v1"


def test_budget_chain_unit():
    from app.models.methodology import Methodology
    m = MethodologyStore().get("deep-research-council-v1")
    m.budget_defaults.max_model_calls = 77
    untouched = ProjectMeta(
        id="p", title="t", question="q",
        created_at="2026-09-05T10:00:00Z",
        council_models=dict(COUNCIL), judge_model=JUDGE)
    assert _resolve_budget(untouched, m, None).max_model_calls == 77
    touched = untouched.model_copy()
    touched.budget.max_model_calls = 60
    assert _resolve_budget(touched, m, None).max_model_calls == 60
    assert _resolve_budget(
        untouched, m, {"max_model_calls": 11}).max_model_calls == 11


def test_set_default_changes_default(tmp_path):
    store = MethodologyStore(tmp_path / "m")
    base = {"name": "n", "description": "d",
            "compatible_modes": ["research"],
            "workflow": {"stages": [{"id": "a", "node": "plan"}]},
            "tools": {"enabled": []}, "prompts": {"set": "x"},
            "skills": {}, "models": {"scientist": "m", "judge": "j"},
            "budget_defaults": {}}
    from app.models.methodology import Methodology as M
    store.save(M(**{**base, "id": "one", "is_default": True}))
    store.save(M(**{**base, "id": "two", "is_default": False}))
    store.set_default("two")
    assert store.get_default_for_mode("research").id == "two"
    assert store.get("one").is_default is False


def test_restart_keeps_pinned_methodology(client, tmp_path):
    pid = _create(client)["id"]
    rid = client.post(
        f"/api/v1/lab-projects/{pid}/runs",
        json={"methodology_id": "academic-publication-v1",
              "mode": "academic"}).json()["run_id"]
    _wait_for(client, pid, rid, {"awaiting_approval"})
    runs_mod._runs.clear()
    clear_graph_cache()
    assert rehydrate_runs(tmp_path) >= 1
    revived = client.get(
        f"/api/v1/lab-projects/{pid}/runs/{rid}").json()
    assert revived["methodology_id"] == "academic-publication-v1"
    client.post(f"/api/v1/lab-projects/{pid}/runs/{rid}/approve",
                json={"decision": "approve"})
    final = _wait_for(client, pid, rid, {"done"})
    assert final["methodology_id"] == "academic-publication-v1"


def test_frozen_models_win_over_project_yaml(tmp_path, monkeypatch):
    """Batch review: nodes use state-frozen models, never mid-run
    project.yaml reads. Frozen diverges from meta → frozen executes."""
    from app.graph.nodes import _models
    from app.models.evidence import ProjectMeta as PM
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(PM(id="p", title="t", question="q",
                        created_at="2026-09-05T10:00:00Z",
                        council_models=dict(COUNCIL),
                        judge_model=JUDGE))
    frozen = {"council": {"scientist": "m-frozen"}, "judge": "m-jfrozen"}
    council, judge = _models({"models": frozen}, store)
    assert council == {"scientist": "m-frozen"} and judge == "m-jfrozen"
    # Ad-hoc states (no frozen key) fall back to project.yaml.
    council, judge = _models({}, store)
    assert council == COUNCIL and judge == JUDGE


def test_frozen_judge_adjudicates(tmp_path, monkeypatch):
    """Node-level firewall proof: adjudication consults the frozen
    judge model, not project.yaml's."""
    from app.graph import nodes
    from app.models.evidence import Claim, Confidence, Evidence, Source
    seen = {}
    monkeypatch.setattr(
        "app.graph.nodes.call_model_resilient",
        lambda *a, **k: (seen.setdefault("model", a[0]),
                         ("STATUS C-1: SUPPORTED", 1))[1])
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    store = LabProjectStore(tmp_path, "p")
    store.write_meta(PM_meta(tmp_path))
    store.write_source(Source(
        id="S-1", kind="primary_paper", url="https://e.org/1",
        title="t", retrieved_at="2026-09-05T10:00:00Z", quality_tier=2))
    store.write_claim(Claim(
        id="C-1", statement="s", supporting_sources=["S-1"],
        confidence=Confidence(source_quality=0.5,
                              methodological_strength=0.5,
                              independent_confirmation=0.5,
                              contradiction_level=0.5, overall=0.5)))
    store.write_evidence(Evidence(
        id="E-1", source_id="S-1", location={"section": "x"},
        text_reference="t", supports=["C-1"],
        evidence_type="empirical", strength="high"))
    from app.models.evidence import BudgetState
    state = {"lab_project_id": "p", "mode": "research",
             "active_question": "q", "budget": BudgetState(),
             "models": {"council": dict(COUNCIL), "judge": "m-frozen"},
             "pending_tasks": [], "open_contradictions": [],
             "escalate": True, "audit_passed": False,
             "needs_human_approval": False, "session_id": "s",
             "first_pass": {}}
    nodes.make_evidence_adjudication(tmp_path)(state)
    assert seen["model"] == "m-frozen"
    assert store.read_claim("C-1").adjudicated_by == "m-frozen"


def PM_meta(tmp_path):
    from app.models.evidence import ProjectMeta as PM
    return PM(id="p", title="t", question="q",
              created_at="2026-09-05T10:00:00Z",
              council_models=dict(COUNCIL), judge_model=JUDGE)


def test_unspecified_run_follows_set_default(client, tmp_path, monkeypatch):
    """Batch review: set-default flips which methodology an
    unspecified run uses — proven over HTTP via the seam (committed
    YAMLs never mutated)."""
    import app.api.runs as runs_api
    from app.store.methodology import MethodologyStore as MS
    from app.models.methodology import Methodology as M
    mem = MS(tmp_path / "mem")
    base = {"name": "n", "description": "d",
            "compatible_modes": ["research"],
            "workflow": {"stages": [
                {"id": "trigger_classifier", "node": "trigger_classifier",
                 "route": "route_classifier"},
                {"id": "plan", "node": "plan"},
                {"id": "final_output", "node": "final_output"}]},
            "tools": {"enabled": []}, "prompts": {"set": "x"},
            "skills": {}, "budget_defaults": {}}
    mem.save(M(**{**base, "id": "first", "is_default": True,
                  "models": {"scientist": "m", "judge": "j"}}))
    mem.save(M(**{**base, "id": "second", "is_default": False,
                  "models": {"scientist": "m", "judge": "j"}}))
    monkeypatch.setattr(runs_api, "_methodology_store", lambda: mem)
    pid = _create(client)["id"]
    first = client.post(f"/api/v1/lab-projects/{pid}/runs",
                        json={}).json()
    assert first["methodology_id"] == "first"
    mem.set_default("second")
    second = client.post(f"/api/v1/lab-projects/{pid}/runs",
                         json={}).json()
    assert second["methodology_id"] == "second"
