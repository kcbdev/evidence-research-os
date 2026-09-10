"""Tier-2 BM25 keyword index (PBI-041, guide Task 30).

Per-project Tantivy index over claims/evidence/ideas YAML, under
`<project>/.index/tantivy/` (derived, gitignored like claims.db).
Rebuild discipline is mtime-checked lazy — `keyword_search` rebuilds
when the index is missing or older than the newest source YAML, never
inline on store writes (same no-invalidation-protocol rule as the
claims.db view). Empty projects return [] without building.
"""
from pathlib import Path
import tantivy

SUBDIRS = ("claims", "evidence", "ideas")


def build_schema():
    sb = tantivy.SchemaBuilder()
    sb.add_text_field("id", stored=True, tokenizer_name="raw")
    sb.add_text_field("body", stored=True)
    return sb.build()


def _source_files(project_dir: Path) -> list[Path]:
    files = []
    for sub in SUBDIRS:
        files.extend(sorted((project_dir / sub).glob("*.yaml")))
    return files


def _index_dir(project_dir: Path) -> Path:
    return Path(project_dir) / ".index" / "tantivy"


def _is_stale(project_dir: Path, files: list[Path]) -> bool:
    idx = _index_dir(project_dir)
    if not (idx / "meta.json").exists():
        return True
    index_mtime = (idx / "meta.json").stat().st_mtime
    return any(f.stat().st_mtime > index_mtime for f in files)


def rebuild_index(project_dir: Path):
    """Full regenerate (not merge) — indexes are derived, cheap at this
    scale, and regenerate-not-merge can't drift."""
    project_dir = Path(project_dir)
    files = _source_files(project_dir)
    idx_dir = _index_dir(project_dir)
    idx_dir.mkdir(parents=True, exist_ok=True)
    index = tantivy.Index(build_schema(), path=str(idx_dir))
    writer = index.writer()
    writer.delete_all_documents()
    for f in files:
        writer.add_document(tantivy.Document(
            id=f.stem, body=f.read_text(encoding="utf-8")))
    writer.commit()
    index.reload()


def keyword_search(project_dir: Path, query: str,
                   limit: int = 10) -> list[dict]:
    """[{id, snippet}] ordered by BM25. Rebuilds lazily when stale."""
    project_dir = Path(project_dir)
    files = _source_files(project_dir)
    if not files:
        return []
    if _is_stale(project_dir, files):
        rebuild_index(project_dir)
    index = tantivy.Index(build_schema(),
                          path=str(_index_dir(project_dir)))
    index.reload()
    searcher = index.searcher()
    # Task questions are natural language ("Adjudicate ... on: <stmt>",
    # quotes, parens) — sanitize query syntax chars first, or `on:`
    # parses as a field query and the search throws. Plain terms only.
    safe = "".join(c if c.isalnum() or c.isspace() else " " for c in query)
    if not safe.strip():
        return []
    parsed = index.parse_query(safe, ["body"])
    hits = []
    for _score, addr in searcher.search(parsed, limit).hits:
        doc = searcher.doc(addr)
        body = doc["body"][0]
        hits.append({"id": doc["id"][0],
                     "snippet": body[:500]})
    return hits
