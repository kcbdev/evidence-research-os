"""Tier-3 vector index (PBI-042, guide Task 31; shared in PBI-046).

ONE LanceDB table for the whole lab root at
`<lab-root>/.shared-index/lancedb/`, with `project_id` as the
filterable column (per-project tables were a Phase-3 stepping stone —
PBI-046 repointed the connection once, per the guide). Per-project
freshness via watermark files (`<project_id>.json` beside the table);
stale or missing → full regenerate of that project's rows
(regenerate-not-merge can't drift). Empty projects return [].

Reads never embed except the query itself: `/search` serves whatever
the shared table holds (active projects stay fresh through their own
investigator runs; the rest via `backfill_shared_index`, also runnable
as `python -m app.tools.semantic_index <lab-root>`).

The model downloads on FIRST live use (~130MB to the fastembed cache),
never in tests: `embed()` is the single seam — tests monkeypatch it
and no download happens.
"""
import json
import re
import sys
from pathlib import Path
import lancedb

TABLE = "evidence_units"
MODEL = "BAAI/bge-small-en-v1.5"
SUBDIRS = ("claims", "evidence", "ideas")

_embedder = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        from fastembed import TextEmbedding
        _embedder = TextEmbedding(model_name=MODEL)
    return _embedder


def embed(text: str) -> list[float]:
    """Single seam for all embedding (mocked in tests)."""
    return list(_get_embedder().embed([text]))[0].tolist()


def _lab_root(project_dir: Path) -> Path:
    # Store layout: <lab-root>/<project-id> — the project dir's parent
    # IS the lab root (same assumption nodes already make for debates/).
    return Path(project_dir).parent


def _shared_dir(lab_root: Path) -> Path:
    return Path(lab_root) / ".shared-index" / "lancedb"


def _check_project_id(project_id: str):
    if not re.fullmatch(r"[\w-]+", project_id):
        raise ValueError(f"bad project id for index predicate: {project_id!r}")


def _source_files(project_dir: Path) -> list[Path]:
    files = []
    for sub in SUBDIRS:
        files.extend(sorted((Path(project_dir) / sub).glob("*.yaml")))
    return files


def _watermark(lab_root: Path, project_id: str) -> Path:
    return _shared_dir(lab_root).parent / f"{project_id}.json"


def _is_stale(lab_root: Path, project_id: str,
              files: list[Path]) -> bool:
    wm = _watermark(lab_root, project_id)
    if not wm.is_file():
        return True
    try:
        stamped = json.loads(wm.read_text(encoding="utf-8"))["mtime"]
    except (ValueError, KeyError):
        return True
    return any(f.stat().st_mtime > stamped for f in files)


def _refresh(lab_root: Path, project_id: str, files: list[Path]):
    """Delete this project's rows + re-add from current YAML."""
    _check_project_id(project_id)
    lab_root = Path(lab_root)
    db = lancedb.connect(str(_shared_dir(lab_root)))
    if TABLE not in db.table_names():
        db.create_table(TABLE, data=[{
            "id": "__seed__", "vector": embed("seed"), "text": "",
            "project_id": "__seed__"}])
    table = db.open_table(TABLE)
    table.delete(f"project_id == '{project_id}'")
    rows = [{"id": f.stem,
             "vector": embed(f.read_text(encoding="utf-8")),
             "text": f.read_text(encoding="utf-8")[:2000],
             "project_id": project_id}
            for f in files]
    if rows:
        table.add(rows)
    newest = max((f.stat().st_mtime for f in files), default=0.0)
    _watermark(lab_root, project_id).parent.mkdir(parents=True,
                                                  exist_ok=True)
    _watermark(lab_root, project_id).write_text(
        json.dumps({"mtime": newest}), encoding="utf-8")


def _ensure_fresh(project_dir: Path, project_id: str):
    root = _lab_root(project_dir)
    files = _source_files(Path(project_dir))
    if not files:
        return False
    if _is_stale(root, project_id, files):
        _refresh(root, project_id, files)
    return True


def semantic_search(project_dir: Path, query: str, limit: int = 10,
                    project_id: str | None = None) -> list[dict]:
    """[{id, text, project_id, distance}] nearest-first. project_id set
    → own rows only (investigator); None → cross-project (search API,
    served as-is — see module docstring on freshness)."""
    project_dir = Path(project_dir)
    root = _lab_root(project_dir)
    if project_id is not None:
        if not _source_files(project_dir):
            return []
        _check_project_id(project_id)
        _ensure_fresh(project_dir, project_id)
    db = lancedb.connect(str(_shared_dir(root)))
    if TABLE not in db.table_names():
        return []
    table = db.open_table(TABLE)
    q = table.search(embed(query))
    if project_id is not None:
        q = q.where(f"project_id == '{project_id}'")
    out = []
    for row in q.limit(limit).to_list():
        if row["project_id"] == "__seed__":
            continue
        out.append({"id": row["id"], "text": row["text"],
                    "project_id": row["project_id"],
                    "distance": row["_distance"]})
    return out


def cross_project_search(lab_root: Path, query: str,
                         limit: int = 20) -> list[dict]:
    """Shared-table read (no refresh — freshness is per-project,
    maintained by investigator runs and backfill)."""
    db = lancedb.connect(str(_shared_dir(Path(lab_root))))
    if TABLE not in db.table_names():
        return []
    out = []
    for row in db.open_table(TABLE).search(embed(query)).limit(
            limit).to_list():
        if row["project_id"] == "__seed__":
            continue
        out.append({"id": row["id"], "text": row["text"],
                    "project_id": row["project_id"],
                    "distance": row["_distance"]})
    return out


def backfill_shared_index(lab_root: Path) -> list[str]:
    """Refresh every project dir (has project.yaml). Idempotent:
    delete + re-add per project. The ops path for stale projects."""
    lab_root = Path(lab_root)
    done = []
    for child in sorted(lab_root.iterdir()):
        if child.is_dir() and (child / "project.yaml").is_file():
            files = _source_files(child)
            if files:
                _refresh(lab_root, child.name, files)
                done.append(child.name)
    return done


if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    print(f"backfilled: {backfill_shared_index(root)}")
