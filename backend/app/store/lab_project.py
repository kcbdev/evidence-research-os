"""Filesystem store — the ONLY writer of Lab Project object YAML.

Every Lab Project write goes through LabProjectStore; agents, graph
nodes, and API routers never touch object YAML directly (PBI-003
verification proves this by grep). Every write is one git commit in
the Lab Project repo (plan task 5): `Repo.init` on creation,
`index.add` + `index.commit` on every `_write`/`write_meta` with a
descriptive message — `git log` reads as the project's history.
"""
import yaml
from pathlib import Path
from git import Repo
from app.models.evidence import (
    Source, Claim, Evidence, Idea, Task, Decision, ProjectMeta,
)

LAYOUT_SUBDIRS = [
    "sources", "claims", "ideas", "evidence", "contradictions",
    "experiments", "tasks", "decisions", "debates",
    "audits", "product", "output", "tool_outputs",
]
# NOTE: "ideas" is absent from guide §1.2 but required by spec §4.1
# (ideas/*.yaml). The dir ships empty until Phase 2 populates it.


class LabProjectStore:
    def __init__(self, root: Path, project_id: str):
        self.path = Path(root) / project_id
        self._ensure_layout()
        gitdir = self.path / ".git"
        self.repo = Repo(self.path) if gitdir.exists() else Repo.init(self.path)
        # Commits need a git identity: production relies on the machine's
        # git config (standard behavior); tests set a repo-local identity.

    def _ensure_layout(self):
        for sub in LAYOUT_SUBDIRS:
            (self.path / sub).mkdir(parents=True, exist_ok=True)
        # Derived/discardable paths stay untracked (ADR-0001). Written
        # here, committed lazily with the first object write (see
        # _commit) so project creation itself mints no commits.
        gi = self.path / ".gitignore"
        if not gi.exists():
            gi.write_text("plan/\ndebates/\ntool_outputs/\n.index/\n"
                          "checkpoint.sqlite\n")

    def _commit(self, rel_path: Path, msg: str):
        paths = [str(rel_path)]
        gi = self.path / ".gitignore"
        if gi.exists():
            try:
                untracked = self.repo.untracked_files
            except Exception:
                untracked = []
            if ".gitignore" in untracked:
                paths.append(".gitignore")
        self.repo.index.add(paths)
        self.repo.index.commit(msg)

    def _write(self, subdir: str, obj_id: str, model, commit_msg: str):
        p = self.path / subdir / f"{obj_id}.yaml"
        p.write_text(yaml.safe_dump(model.model_dump(mode="json")))
        self._commit(p.relative_to(self.path), commit_msg)

    def _read(self, subdir: str, obj_id: str, model_cls):
        p = self.path / subdir / f"{obj_id}.yaml"
        return model_cls(**yaml.safe_load(p.read_text()))

    def _list(self, subdir: str, model_cls):
        # sorted(): intentional determinism — bare glob order is OS-dependent.
        return [model_cls(**yaml.safe_load(p.read_text()))
                for p in sorted((self.path / subdir).glob("*.yaml"))]

    def write_meta(self, m: ProjectMeta):
        p = self.path / "project.yaml"
        p.write_text(yaml.safe_dump(m.model_dump(mode="json")))
        self._commit(p.relative_to(self.path), f"meta: {m.id}")

    def read_meta(self) -> ProjectMeta:
        return ProjectMeta(
            **yaml.safe_load((self.path / "project.yaml").read_text()))

    def write_source(self, s: Source):
        self._write("sources", s.id, s, f"source: {s.id}")

    def read_source(self, id: str) -> Source:
        return self._read("sources", id, Source)

    def list_sources(self) -> list[Source]:
        return self._list("sources", Source)

    def write_claim(self, c: Claim):
        self._write("claims", c.id, c, f"claim: {c.id} -> {c.status}")

    def read_claim(self, id: str) -> Claim:
        return self._read("claims", id, Claim)

    def list_claims(self) -> list[Claim]:
        return self._list("claims", Claim)

    def write_evidence(self, e: Evidence):
        self._write("evidence", e.id, e, f"evidence: {e.id}")

    def read_evidence(self, id: str) -> Evidence:
        return self._read("evidence", id, Evidence)

    def list_evidence(self) -> list[Evidence]:
        return self._list("evidence", Evidence)

    def write_idea(self, i: Idea):
        self._write("ideas", i.id, i, f"idea: {i.id}")

    def read_idea(self, id: str) -> Idea:
        return self._read("ideas", id, Idea)

    def list_ideas(self) -> list[Idea]:
        return self._list("ideas", Idea)

    def write_task(self, t: Task):
        self._write("tasks", t.id, t, f"task: {t.id}")

    def delete_task(self, id: str):
        # Queue semantics (PBI-011): consumed/resolved tasks leave the
        # queue; git history preserves them. Only our contradiction tasks
        # (T-C-*) are ever pruned, and only by conflict_detection.
        p = self.path / "tasks" / f"{id}.yaml"
        if not p.exists():
            return
        # working_tree=True: `git rm`, not `git rm --cached`. The queue
        # file must actually leave, git history keeps the record.
        self.repo.index.remove([str(p.relative_to(self.path))],
                               working_tree=True)
        self.repo.index.commit(f"task done: {id}")

    def read_task(self, id: str) -> Task:
        return self._read("tasks", id, Task)

    def list_tasks(self) -> list[Task]:
        return self._list("tasks", Task)

    def write_decision(self, d: Decision):
        self._write("decisions", d.id, d, f"decision: {d.what[:60]}")

    def read_decision(self, id: str) -> Decision:
        return self._read("decisions", id, Decision)

    def list_decisions(self) -> list[Decision]:
        return self._list("decisions", Decision)
