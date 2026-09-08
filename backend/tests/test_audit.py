"""PBI-013 gate: existence-only audit, void-linkage repair, checkpoint
flag, terminal outputs, mid-repair exhaustion, rebuild durability.

LLM boundary mocked; project meta + git identity seeded per project.
"""
from app.graph import nodes
from app.graph.build import build_graph
from app.models.evidence import (BudgetState, Claim, Evidence, ProjectMeta,
                                 Source)
from app.store.lab_project import LabProjectStore

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _mock(monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))


def _seed(tmp_path, meta=None):
    store = LabProjectStore(tmp_path, "p")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    store.write_meta(meta or ProjectMeta(
        id="p", title="t", question="q", created_at=TS,
        council_models=COUNCIL, judge_model=JUDGE))
    return store


def _state(budget=None, **over):
    state = {
        "lab_project_id": "p", "mode": "research", "active_question": "q",
        "budget": budget or BudgetState(), "pending_tasks": [],
        "open_contradictions": [], "escalate": True, "audit_passed": False,
        "needs_human_approval": False, "session_id": "s-1", "first_pass": {},
    }
    state.update(over)
    return state


def _source(store, sid="S-1"):
    store.write_source(Source(id=sid, kind="primary_paper",
                              url="https://e.org", title="t",
                              retrieved_at=TS, quality_tier=2))


def test_audit_passes_when_all_cited_exist(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _source(store)
    store.write_claim(Claim(id="C-1", statement="s",
                            supporting_sources=["S-1"],
                            opposing_sources=[]))
    out = nodes.make_citation_audit(tmp_path)(_state())
    assert out == {"audit_passed": True}


def test_audit_fails_on_dangling_citation(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    store.write_claim(Claim(id="C-1", statement="s",
                            supporting_sources=["S-404"]))
    out = nodes.make_citation_audit(tmp_path)(_state())
    assert out == {"audit_passed": False}


def test_repair_voids_dangling_links_keeps_status(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _source(store)
    store.write_claim(Claim(id="C-1", statement="s", status="SUPPORTED",
                            supporting_sources=["S-1", "S-404"],
                            opposing_sources=["S-405"]))
    nodes.make_targeted_repair(tmp_path)(_state())
    claim = store.read_claim("C-1")
    assert (claim.supporting_sources, claim.opposing_sources) == (["S-1"], [])
    assert claim.status == "SUPPORTED"  # hygiene, not revision
    out = nodes.make_citation_audit(tmp_path)(_state())
    assert out == {"audit_passed": True}


def test_checkpoint_sets_approval_flag():
    out = nodes.human_checkpoint(_state())
    assert out == {"needs_human_approval": True}


def test_final_output_completed_run(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _source(store)
    nodes.make_final_output(tmp_path)(_state(session_id="s-9"))
    refs = (tmp_path / "p" / "output" / "references.md").read_text(encoding="utf-8")
    assert "[S-1]" in refs and "https://e.org" in refs
    decision = store.read_decision("D-terminal-s-9")
    assert decision.what == "Run ended: completed"


def test_final_output_exhausted_run(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    budget = BudgetState(calls_used=50)
    nodes.make_final_output(tmp_path)(_state(budget=budget,
                                             session_id="s-10"))
    assert store.read_decision("D-terminal-s-10").what == \
        "Run ended: budget_exhausted"


def test_repair_loop_runs_once_then_pauses(tmp_path, monkeypatch):
    _mock(monkeypatch)
    _seed(tmp_path)
    store = LabProjectStore(tmp_path, "p")
    store.write_claim(Claim(id="C-1", statement="s",
                            supporting_sources=["S-404"]))
    graph = build_graph(tmp_path, COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    graph.invoke(_state(), config)
    # Repair voided the dangling id, second audit passed, run paused:
    assert store.read_claim("C-1").supporting_sources == []
    assert tuple(graph.get_state(config).next) == ("human_checkpoint",)
    # ...and resumes through to a completed terminal record:
    graph.invoke(None, config)
    assert tuple(graph.get_state(config).next) == ()
    assert (tmp_path / "p" / "output" / "references.md").is_file()
    assert (tmp_path / "p" / "output" / "report.md").is_file()
    assert store.read_decision("D-terminal-s-1").what == \
        "Run ended: completed"


def test_exhausted_audit_skips_repair_ends_run(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _source(store)
    store.write_claim(Claim(id="C-1", statement="s",
                            supporting_sources=["S-1", "S-404"]))
    store.write_evidence(Evidence(id="E-1", source_id="S-1",
                                  location={"section": "s"},
                                  text_reference="t", supports=["C-1"],
                                  evidence_type="empirical", strength="high"))
    graph = build_graph(tmp_path, COUNCIL, JUDGE)
    config = {"configurable": {"thread_id": "t1"}}
    # Calls exhaust DURING review+adjudication (3+1+1=5/5): the audit
    # would FAIL (S-404) but the exhausted edge ends the run instead of
    # repairing. (The mocked first pass contributes no findings.)
    graph.invoke(_state(budget=BudgetState(max_model_calls=5)), config)
    assert tuple(graph.get_state(config).next) == ()
    assert "S-404" in store.read_claim("C-1").supporting_sources
    assert store.read_decision("D-terminal-s-1").what == \
        "Run ended: budget_exhausted"


def test_pause_survives_graph_rebuild(tmp_path, monkeypatch):
    _mock(monkeypatch)
    _seed(tmp_path)
    config = {"configurable": {"thread_id": "t1"}}
    build_graph(tmp_path, COUNCIL, JUDGE).invoke(_state(), config)
    rebuilt = build_graph(tmp_path, COUNCIL, JUDGE)
    assert tuple(rebuilt.get_state(config).next) == ("human_checkpoint",)
