"""Tier-3 vector index (PBI-042, guide Task 31).

Per-project LanceDB table over claims/evidence/ideas text, under
`<project>/.index/lancedb/`, embedded locally (BAAI/bge-small-en-v1.5,
CPU/ONNX — no API call per file). Same mtime-checked lazy discipline
as Tier 2: stale or missing → full regenerate (embeddings are local
and cheap at this scale; regenerate-not-merge can't drift). Empty
projects return [] without touching disk.

The model downloads on FIRST live use (~130MB to the fastembed cache),
never in tests: `embed()` is the single seam — tests monkeypatch it
and no download happens. Live first-run cost is documented here, not
discovered at 2am.
"""
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


def _index_dir(project_dir: Path) -> Path:
    return Path(project_dir) / ".index" / "lancedb"


def _source_files(project_dir: Path) -> list[Path]:
    files = []
    for sub in SUBDIRS:
        files.extend(sorted((Path(project_dir) / sub).glob("*.yaml")))
    return files


def _is_stale(project_dir: Path, files: list[Path]) -> bool:
    idx = _index_dir(project_dir)
    if not idx.exists():
        return True
    index_mtime = idx.stat().st_mtime
    return any(f.stat().st_mtime > index_mtime for f in files)


def _refresh(project_dir: Path, files: list[Path]):
    """Drop + rebuild (regenerate, not merge)."""
    db = lancedb.connect(str(_index_dir(project_dir)))
    if TABLE in db.table_names():
        db.drop_table(TABLE)
    rows = [{"id": f.stem,
             "vector": embed(f.read_text(encoding="utf-8")),
             "text": f.read_text(encoding="utf-8")[:2000],
             "project_id": Path(project_dir).name}
            for f in files]
    db.create_table(TABLE, data=rows)


def index_evidence_unit(project_dir: Path, doc_id: str, text: str,
                        project_id: str):
    """Single-doc upsert (kept for the guide's API; the lazy path
    regenerates whole — both funnel through the same table)."""
    project_dir = Path(project_dir)
    db = lancedb.connect(str(_index_dir(project_dir)))
    if TABLE not in db.table_names():
        db.create_table(TABLE, data=[
            {"id": doc_id, "vector": embed(text),
             "text": text[:2000], "project_id": project_id}])
        return
    table = db.open_table(TABLE)
    table.delete(f"id == '{doc_id}'")
    table.add([{"id": doc_id, "vector": embed(text),
                "text": text[:2000], "project_id": project_id}])


def semantic_search(project_dir: Path, query: str,
                    limit: int = 10) -> list[dict]:
    """[{id, text, project_id, distance}] nearest-first. Lazy refresh."""
    project_dir = Path(project_dir)
    files = _source_files(project_dir)
    if not files:
        return []
    if _is_stale(project_dir, files):
        _refresh(project_dir, files)
    table = lancedb.connect(str(_index_dir(project_dir))).open_table(TABLE)
    out = []
    for row in table.search(embed(query)).limit(limit).to_list():
        out.append({"id": row["id"], "text": row["text"],
                    "project_id": row["project_id"],
                    "distance": row["_distance"]})
    return out
