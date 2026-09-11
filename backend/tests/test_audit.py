"""PBI-013 gate: existence-only audit, void-linkage repair, checkpoint
flag, terminal outputs, mid-repair exhaustion, rebuild durability.

LLM boundary mocked; project meta + git identity seeded per project.
"""
from app.graph import nodes
from tests.helpers import default_graph
from app.models.evidence import (BudgetState, Claim, Evidence, ProjectMeta,
                                 Source)
from app.store.lab_project import LabProjectStore

TS = "2026-09-05T10:00:00Z"
COUNCIL = {"scientist": "m-sci", "investigator": "m-inv", "skeptic": "m-ske"}
JUDGE = "m-judge"


def _mock(monkeypatch):
    monkeypatch.setattr("app.graph.nodes.call_model_resilient",
                        lambda *a, **k: ("", 1))
    # PBI-043: final_output embeds sources post-run — constant vectors,
    # no download, deterministic clustering in graph-level tests.
    monkeypatch.setattr("app.tools.semantic_index.embed",
                        lambda text: [1.0, 0.0])


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
    assert out["audit_passed"] is True
    assert store.list_audit_runs()[-1].results == []


def test_audit_fails_on_dangling_citation(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    store.write_claim(Claim(id="C-1", statement="s",
                            supporting_sources=["S-404"]))
    out = nodes.make_citation_audit(tmp_path)(_state())
    assert out["audit_passed"] is False
    row = store.list_audit_runs()[-1].results[0]
    assert (row.claim_id, row.evidence_id) == ("C-1", None)
    assert row.checks[0].stage == "existence"
    assert row.checks[0].status == "FAIL"


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
    assert out["audit_passed"] is True


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
    graph = default_graph(tmp_path, "research", COUNCIL, JUDGE)
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
    graph = default_graph(tmp_path, "research", COUNCIL, JUDGE)
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
    default_graph(tmp_path, "research", COUNCIL, JUDGE).invoke(_state(), config)
    rebuilt = default_graph(tmp_path, "research", COUNCIL, JUDGE)
    assert tuple(rebuilt.get_state(config).next) == ("human_checkpoint",)


# --- PBI-039: 3-stage probes (real stage distinctions, never faked) ---

def _seed_pair(store, section="methods"):
    _source(store)
    store.write_claim(Claim(id="C-1", statement="microbe Y causes effect X",
                            supporting_sources=["S-1"], opposing_sources=[]))
    store.write_evidence(Evidence(
        id="E-1", source_id="S-1", location={"section": section},
        text_reference="the paper mentions microbes in passing",
        supports=["C-1"], evidence_type="empirical", strength="high"))


def _mock_verify(monkeypatch, fetch_text="results and discussion",
                 auditor_text="FAIL — merely topical, supports nothing.",
                 auditor="m-aud"):
    monkeypatch.setattr("app.tools.citation_verify.cached_fetch_url",
                        lambda *a, **k: fetch_text)
    monkeypatch.setattr("app.tools.citation_verify.call_model_resilient",
                        lambda *a, **k: (auditor_text, 2))
    monkeypatch.setattr("app.tools.citation_verify.resolve_auditor",
                        lambda *a, **k: (auditor, None))


def test_support_match_fail_distinct_from_existence(tmp_path, monkeypatch):
    """Done probe: real + reachable + off-claim source fails exactly at
    support_match (PASS existence, WARNING pincite for the absent
    section), not as a broken link."""
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _seed_pair(store)
    _mock_verify(monkeypatch)
    out = nodes.make_citation_audit(tmp_path)(_state())
    assert out["audit_passed"] is False
    assert out["budget"].calls_used == 2  # auditor attempts charged
    row = store.list_audit_runs()[-1].results[-1]
    assert (row.claim_id, row.evidence_id) == ("C-1", "E-1")
    by_stage = {c.stage: c for c in row.checks}
    assert by_stage["existence"].status == "PASS"
    assert by_stage["pincite"].status == "WARNING"
    assert by_stage["support_match"].status == "FAIL"
    assert "topical" in by_stage["support_match"].detail


def test_unreachable_source_fails_existence_only(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _seed_pair(store)

    def _boom(*a, **k):
        raise RuntimeError("connection refused")
    monkeypatch.setattr("app.tools.citation_verify.cached_fetch_url", _boom)
    monkeypatch.setattr("app.tools.citation_verify.resolve_auditor",
                        lambda *a, **k: ("m-aud", None))
    out = nodes.make_citation_audit(tmp_path)(_state())
    assert out["audit_passed"] is False
    row = store.list_audit_runs()[-1].results[-1]
    by_stage = {c.stage: c for c in row.checks}
    assert by_stage["existence"].status == "FAIL"
    assert "unreachable" in by_stage["existence"].detail
    assert by_stage["pincite"].status == "WARNING"
    assert by_stage["support_match"].status == "WARNING"
    assert out["budget"].calls_used == 0  # no auditor call made


def test_unset_auditor_degrades_to_warning(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _seed_pair(store, section="results and discussion")
    _mock_verify(monkeypatch, auditor=None)
    out = nodes.make_citation_audit(tmp_path)(_state())
    row = store.list_audit_runs()[-1].results[-1]
    by_stage = {c.stage: c for c in row.checks}
    assert by_stage["existence"].status == "PASS"
    assert by_stage["pincite"].status == "PASS"
    assert by_stage["support_match"].status == "WARNING"
    assert "no auditor model" in by_stage["support_match"].detail
    assert out["audit_passed"] is True  # warnings don't fail the run


def test_rotation_overlapping_auditor_refused(tmp_path, monkeypatch):
    """Batch review: env auditor inside the rotation degrades LOUDLY
    (named reason), never silently judges."""
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _seed_pair(store)
    _mock_verify(monkeypatch)
    monkeypatch.setattr("app.tools.citation_verify.resolve_auditor",
                        lambda *a, **k: (None, "auditor model m-ske "
                                              "overlaps the council/judge "
                                              "rotation — ignored"))
    out = nodes.make_citation_audit(tmp_path)(_state())
    row = store.list_audit_runs()[-1].results[-1]
    by_stage = {c.stage: c for c in row.checks}
    assert by_stage["support_match"].status == "WARNING"
    assert "overlaps" in by_stage["support_match"].detail


def test_resolve_auditor_rotation_guard_unit(tmp_path, monkeypatch):
    from app.tools.citation_verify import resolve_auditor
    monkeypatch.setenv("AUDITOR_MODEL", "m-ske")
    model, note = resolve_auditor(
        tmp_path, {"scientist": "m-sci", "skeptic": "m-ske"}, "m-judge")
    assert model is None and "overlaps" in note
    model, note = resolve_auditor(
        tmp_path, {"scientist": "m-sci"}, "m-judge")
    assert model == "m-ske" and note is None


def test_empty_body_warns_not_passes(tmp_path, monkeypatch):
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _seed_pair(store)
    _mock_verify(monkeypatch)
    monkeypatch.setattr("app.tools.citation_verify.cached_fetch_url",
                        lambda *a, **k: "   ")
    out = nodes.make_citation_audit(tmp_path)(_state())
    row = store.list_audit_runs()[-1].results[-1]
    by_stage = {c.stage: c for c in row.checks}
    assert by_stage["existence"].status == "WARNING"
    assert "empty" in by_stage["existence"].detail
    assert out["audit_passed"] is True


def test_audit_ids_not_reused(tmp_path, monkeypatch):
    from app.tools.citation_verify import next_audit_id
    _mock(monkeypatch)
    store = _seed(tmp_path)
    _seed_pair(store)
    _mock_verify(monkeypatch)
    nodes.make_citation_audit(tmp_path)(_state())
    nodes.make_citation_audit(tmp_path)(_state())
    assert [r.id for r in store.list_audit_runs()] == ["A-001", "A-002"]
    assert next_audit_id(store) == "A-003"
