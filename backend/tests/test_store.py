"""PBI-003 gate: layout creation + typed write/read/list on an isolated tmp dir."""
from pathlib import Path

from app.models.evidence import (
    Source, Claim, Evidence, Idea, Task, Decision, ProjectMeta,
)
from app.store.lab_project import LabProjectStore, LAYOUT_SUBDIRS

TS = "2026-09-05T10:00:00Z"


def make_store(tmp_path: Path) -> LabProjectStore:
    return LabProjectStore(tmp_path, "lp-test")


def test_layout_created(tmp_path):
    store = make_store(tmp_path)
    for sub in LAYOUT_SUBDIRS:
        assert (store.path / sub).is_dir(), f"missing subdir {sub}"
    assert not (store.path / ".git").exists()  # PBI-004 owns git


def test_meta_roundtrip(tmp_path):
    store = make_store(tmp_path)
    meta = ProjectMeta(id="lp-test", title="t", question="q",
                       created_at=TS,
                       council_models={"scientist": "m1"},
                       judge_model="mj")
    store.write_meta(meta)
    assert store.read_meta() == meta


def _check_crud(store, write, read, listed, obj):
    assert listed() == []
    write(obj)
    assert read(obj.id) == obj
    write(obj)
    got = listed()
    assert len(got) == 1 and got[0] == obj


def test_source_crud(tmp_path):
    store = make_store(tmp_path)
    _check_crud(store, store.write_source, store.read_source,
                store.list_sources,
                Source(id="S-1", kind="journalism", url="https://e.org",
                       title="t", retrieved_at=TS, quality_tier=5))


def test_claim_crud(tmp_path):
    store = make_store(tmp_path)
    _check_crud(store, store.write_claim, store.read_claim,
                store.list_claims,
                Claim(id="C-1", statement="s", status="SUPPORTED"))


def test_evidence_crud(tmp_path):
    store = make_store(tmp_path)
    _check_crud(store, store.write_evidence, store.read_evidence,
                store.list_evidence,
                Evidence(id="E-1", source_id="S-1",
                         location={"page": 1, "section": "s"},
                         text_reference="t", evidence_type="analogical",
                         strength="low"))


def test_idea_task_decision_crud(tmp_path):
    store = make_store(tmp_path)
    _check_crud(store, store.write_idea, store.read_idea,
                store.list_ideas, Idea(id="I-1", statement="s"))
    _check_crud(store, store.write_task, store.read_task,
                store.list_tasks,
                Task(id="T-1", question="q", reason="r",
                     assigned_agent="scientist"))
    _check_crud(store, store.write_decision, store.read_decision,
                store.list_decisions,
                Decision(id="D-1", what="w", why="y", timestamp=TS))


def test_list_order_stable(tmp_path):
    store = make_store(tmp_path)
    for i in ("C-3", "C-1", "C-2"):
        store.write_claim(Claim(id=i, statement="s"))
    assert [c.id for c in store.list_claims()] == ["C-1", "C-2", "C-3"]
