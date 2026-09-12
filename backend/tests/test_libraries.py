"""PBI-063 gate: builder library API.

Every mutation runs against tmp stores via monkeypatched module attrs
(skills/prompts/roles + the methodology store behind /validate) —
tests must never write the shipped libraries or registry YAMLs.
"""
import pytest
from fastapi.testclient import TestClient
from app.api import runs as runs_mod
from app.api.runs import clear_graph_cache
from app.main import create_app
from app.models.libraries import LibraryRole, Prompt, Skill
from app.store.libraries import LibraryStore
from app.store.methodology import MethodologyStore

SKILL = {"id": "lit-review", "name": "Lit Review",
         "description": "d", "body": "# steps\n1. search"}
PROMPT = {"id": "skeptic-v1", "name": "Skeptic",
          "description": "d", "text": "Attack this claim."}
ROLE = {"id": "red-team", "name": "Red Team",
        "description": "d", "system_prompt": "Find flaws.",
        "tools": ["grep_project"], "model": "",
        "skills": ["lit-review"]}
METHOD = {
    "id": "lib-val-v1", "name": "V", "description": "d",
    "is_default": False, "compatible_modes": ["research"],
    "workflow": {"stages": [
        {"id": "plan", "node": "plan"},
        {"id": "final_output", "node": "final_output"}]},
    "tools": {"enabled": []}, "prompts": {"set": "x"},
    "skills": {}, "models": {"scientist": "m", "judge": "j"},
    "budget_defaults": {},
}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    import app.api.libraries as libraries_api
    import app.api.methodologies as methodologies_api
    monkeypatch.setattr(libraries_api, "skills",
                        LibraryStore(tmp_path / "lib", "skills", Skill))
    monkeypatch.setattr(libraries_api, "prompts",
                        LibraryStore(tmp_path / "lib", "prompts", Prompt))
    monkeypatch.setattr(libraries_api, "roles",
                        LibraryStore(tmp_path / "lib", "roles",
                                     LibraryRole))
    monkeypatch.setattr(methodologies_api, "store",
                        MethodologyStore(tmp_path / "m"))
    for var in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
                "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"):
        monkeypatch.setenv(var, "t" if "NAME" in var else "t@e.org")
    runs_mod._runs.clear()
    with TestClient(create_app(tmp_path)) as client:
        yield client
    clear_graph_cache()
    runs_mod._runs.clear()


def test_skills_crud_round_trip(client):
    assert client.get("/api/v1/skills").json() == []
    created = client.post("/api/v1/skills", json=SKILL)
    assert created.status_code == 201
    assert client.get("/api/v1/skills/lit-review").json()["body"] \
        == SKILL["body"]
    updated = dict(SKILL, body="# v2")
    assert client.put("/api/v1/skills/lit-review",
                      json=updated).json()["body"] == "# v2"
    mismatch = dict(SKILL, id="other")
    assert client.put("/api/v1/skills/lit-review",
                      json=mismatch).status_code == 422
    assert client.put("/api/v1/skills/ghost",
                      json=dict(SKILL, id="ghost")).status_code == 404
    assert client.get("/api/v1/skills/ghost").status_code == 404
    assert client.post("/api/v1/skills", json=SKILL).status_code == 409
    assert client.post("/api/v1/skills",
                       json={"id": "empty", "name": "E",
                             "body": ""}).status_code == 422  # body required


def test_prompts_version_on_repost_and_put(client):
    first = client.post("/api/v1/prompts", json=PROMPT)
    assert first.status_code == 201
    assert first.json()["version"] == 1
    assert first.json()["history"] == []
    second = client.post("/api/v1/prompts",
                         json=dict(PROMPT, text="Attack harder."))
    assert second.status_code == 200
    assert second.json()["version"] == 2
    versions = client.get(
        "/api/v1/prompts/skeptic-v1/versions").json()
    assert [v["version"] for v in versions] == [1, 2]
    assert versions[0]["text"] == "Attack this claim."
    assert versions[1]["text"] == "Attack harder."
    third = client.put("/api/v1/prompts/skeptic-v1",
                       json=dict(PROMPT, text="Attack hardest."))
    assert third.json()["version"] == 3
    assert len(client.get(
        "/api/v1/prompts/skeptic-v1/versions").json()) == 3
    assert client.get("/api/v1/prompts/ghost").status_code == 404
    assert client.get(
        "/api/v1/prompts/ghost/versions").status_code == 404
    mismatch = dict(PROMPT, id="other")
    assert client.put("/api/v1/prompts/skeptic-v1",
                      json=mismatch).status_code == 422


def test_roles_crud_and_tool_gate(client):
    created = client.post("/api/v1/roles", json=ROLE)
    assert created.status_code == 201
    assert client.get("/api/v1/roles/red-team").json()["skills"] == \
        ["lit-review"]
    bad_tool = dict(ROLE, id="bad-role", tools=["search_web"])
    resp = client.post("/api/v1/roles", json=bad_tool)
    assert resp.status_code == 422
    assert "unknown tool 'search_web'" in resp.json()["detail"]
    assert client.post("/api/v1/roles", json=ROLE).status_code == 409
    assert client.get("/api/v1/roles/ghost").status_code == 404


def test_tools_registry_read_only(client):
    rows = client.get("/api/v1/tools").json()
    names = [r["name"] for r in rows]
    assert {"grep_project", "fetch_url", "keyword_search",
            "semantic_search", "retrieve_evidence",
            "store_source"} <= set(names)
    assert all(r["source"] for r in rows)  # honest origin, never blank
    assert client.post("/api/v1/tools", json={}).status_code == 405
    # No write route exists at all: unknown write paths 404, and the
    # exact-path POST 405s (method not allowed on a read-only path).
    assert client.put("/api/v1/tools/x", json={}).status_code == 404
    assert client.delete("/api/v1/tools/grep_project").status_code in (
        404, 405)


def test_condition_fields_shape(client):
    rows = client.get("/api/v1/methodologies/condition-fields").json()
    by_name = {r["field"]: r["type"] for r in rows}
    assert by_name["open_contradictions"] == "count"
    assert by_name["audit_passed"] == "bool"
    assert set(by_name.values()) <= {"count", "bool"}


def test_validate_matches_save_and_writes_nothing(client):
    created = client.post("/api/v1/methodologies", json=METHOD)
    assert created.status_code == 201
    before = client.get("/api/v1/methodologies/lib-val-v1").json()
    ok = client.post("/api/v1/methodologies/lib-val-v1/validate")
    assert ok.json() == {"valid": True, "id": "lib-val-v1"}
    after = client.get("/api/v1/methodologies/lib-val-v1").json()
    assert after == before  # validate persists nothing
    # Direct parity proof: a registry-invalid methodology (schema-valid,
    # so the store accepts it raw, but save-validation would refuse it)
    # fails /validate with the same named-field 422 as a save attempt.
    import app.api.methodologies as methodologies_api
    from app.models.methodology import Methodology
    bad = dict(METHOD, id="lib-bad")
    bad["workflow"] = {"stages": [{"id": "a", "node": "nope"}]}
    assert client.post("/api/v1/methodologies",
                       json=bad).status_code == 422  # save refuses
    methodologies_api.store.save(Methodology(**bad))  # raw seed
    resp = client.post("/api/v1/methodologies/lib-bad/validate")
    assert resp.status_code == 422
    assert "unknown node 'nope'" in resp.json()["detail"]
    assert client.post(
        "/api/v1/methodologies/ghost/validate").status_code == 404
    overlap = dict(METHOD, id="lib-overlap",
                   models={"scientist": "m", "judge": "m"})
    assert client.post("/api/v1/methodologies",
                       json=overlap).status_code == 422  # judge overlap
