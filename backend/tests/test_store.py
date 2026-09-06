"""PBI-003 gate: layout creation + typed write/read/list on an isolated tmp dir."""
from pathlib import Path

from app.models.evidence import (
    Source, Claim, Evidence, Idea, Task, Decision, ProjectMeta,
)
from app.store.lab_project import LabProjectStore, LAYOUT_SUBDIRS

TS = "2026-09-05T10:00:00Z"


def make_store(tmp_path: Path) -> LabProjectStore:
    store = LabProjectStore(tmp_path, "lp-test")
    with store.repo.config_writer() as cfg:  # repo-local test identity
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    return store


def test_layout_created(tmp_path):
    store = make_store(tmp_path)
    for sub in LAYOUT_SUBDIRS:
        assert (store.path / sub).is_dir(), f"missing subdir {sub}"
    assert (store.path / ".git").is_dir()  # PBI-004: git from creation


def test_reuses_existing_repo(tmp_path):
    first = make_store(tmp_path)
    first.write_claim(Claim(id="C-1", statement="s"))
    second = LabProjectStore(tmp_path, "lp-test")
    assert second.read_claim("C-1").statement == "s"
    assert len(list(second.repo.iter_commits())) == 1


def test_git_audit_trail_one_commit_per_write(tmp_path):
    store = make_store(tmp_path)
    meta = ProjectMeta(id="lp-test", title="t", question="q",
                       created_at=TS,
                       council_models={"scientist": "m1"},
                       judge_model="mj")
    store.write_meta(meta)
    store.write_source(Source(id="S-1", kind="journalism",
                              url="https://e.org", title="t",
                              retrieved_at=TS, quality_tier=5))
    store.write_claim(Claim(id="C-1", statement="s", status="SUPPORTED"))
    store.write_evidence(Evidence(id="E-1", source_id="S-1",
                                  location={"page": 1, "section": "s"},
                                  text_reference="t",
                                  evidence_type="analogical",
                                  strength="low"))
    store.write_idea(Idea(id="I-1", statement="s"))
    store.write_task(Task(id="T-1", question="q", reason="r",
                          assigned_agent="scientist"))
    store.write_decision(Decision(id="D-1", what="w", why="y",
                                  timestamp=TS))
    commits = list(store.repo.iter_commits())
    assert len(commits) == 7  # meta + 6 types, one commit per write
    messages = " ".join(c.message for c in commits)
    for needle in ["meta: lp-test", "source: S-1", "claim: C-1",
                   "evidence: E-1", "idea: I-1", "task: T-1",
                   "decision: w"]:  # decision msg carries what[:60], not id
        assert needle in messages, f"missing commit for {needle}"
    shown = store.repo.git.show("--stat", "HEAD~6").splitlines()
    assert any("project.yaml" in line for line in shown)


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


def test_non_ascii_roundtrip_is_utf8(tmp_path):
    # Regression (live run PBI-019): model output carries smart quotes /
    # emoji; locale-default IO corrupted them on Windows (0x92 decode
    # crash in a debates transcript). Store files must be
    # encoding-neutral (yaml escapes to ASCII) and round-trip exactly;
    # raw transcript writes are pinned to UTF-8 in nodes.py.
    store = make_store(tmp_path)
    statement = "It’s “quoted” — café naïve — \U0001F9EA"
    store.write_claim(Claim(id="C-u", statement=statement))
    raw = (store.path / "claims" / "C-u.yaml").read_bytes()
    raw.decode("ascii")  # no locale bytes leaked into the file
    assert store.read_claim("C-u").statement == statement
