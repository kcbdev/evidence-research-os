"""Tool-output cache (guide §4.3, spec §4.4): check-before-fetch, no exceptions.

Layout `tool_outputs/<session_id>/<hash>.<kind>.txt` (session dirs are
provenance). Lookup is TWO-TIER, resolving an apparent spec tension:
the layout strings say session, but the behavioral contract says
"re-running the same question reuses the cache (no refetch)". So a
lookup checks the current session first, then every other session
(global); a global hit is copied into the current session dir. Both
spec statements stay literally true.

Kind-aware keys (`html` vs `pdf`): the same URL fetched both ways must
not collide.

Import rule (PBI-009 review, enforced by `test_no_raw_fetch_imports`
below): graph/agents code MUST use `cached_*` from this module, never
raw `fetch_url`/`fetch_pdf` from `app.tools.fetch`.
"""
import hashlib
from pathlib import Path
from typing import Callable
from app.tools.fetch import fetch_url, fetch_pdf


def cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def _session_file(lab_project_path: Path, session_id: str, url: str,
                  kind: str) -> Path:
    return (Path(lab_project_path) / "tool_outputs" / session_id
            / f"{cache_key(url)}.{kind}.txt")


def _global_hit(lab_project_path: Path, url: str, kind: str) -> Path | None:
    name = f"{cache_key(url)}.{kind}.txt"
    hits = sorted((Path(lab_project_path) / "tool_outputs").glob(f"*/{name}"))
    return hits[0] if hits else None


def cached_fetch(lab_project_path: Path, session_id: str, url: str,
                 fetch_fn: Callable[[str], str], kind: str = "html") -> str:
    mine = _session_file(lab_project_path, session_id, url, kind)
    if mine.exists():
        return mine.read_text(encoding="utf-8")
    shared = _global_hit(lab_project_path, url, kind)
    if shared is not None and shared != mine:
        content = shared.read_text(encoding="utf-8")
        mine.parent.mkdir(parents=True, exist_ok=True)
        mine.write_text(content, encoding="utf-8")  # provenance copy
        return content
    mine.parent.mkdir(parents=True, exist_ok=True)
    result = fetch_fn(url)  # miss: failure raises, nothing cached
    mine.write_text(result, encoding="utf-8")
    return result


def cached_fetch_url(lab_project_path: Path, session_id: str, url: str) -> str:
    return cached_fetch(lab_project_path, session_id, url, fetch_url, kind="html")


def cached_fetch_pdf(lab_project_path: Path, session_id: str, url: str) -> str:
    # Caches extracted text (what agents read), not raw PDF bytes.
    return cached_fetch(lab_project_path, session_id, url, fetch_pdf, kind="pdf")
