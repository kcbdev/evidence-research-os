"""Tool-output cache (guide §4.3, spec §4.4): check-before-fetch, no exceptions.

Layout `<project>/tool_outputs/<session_id>/<sha256(url)[:16]>.txt`
is session-scoped per the spec: the same URL in a new session refetches
(cross-session reuse is a later optimization, not silent behavior).

Import rule (PBI-009 review): graph/agents code MUST use `cached_*`
from this module, never raw `fetch_url`/`fetch_pdf` from
`app.tools.fetch`. PBI-011 acceptance enforces it.
"""
import hashlib
from pathlib import Path
from typing import Callable
from app.tools.fetch import fetch_url, fetch_pdf


def cache_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def cached_fetch(lab_project_path: Path, session_id: str, url: str,
                 fetch_fn: Callable[[str], str]) -> str:
    cache_dir = Path(lab_project_path) / "tool_outputs" / session_id
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{cache_key(url)}.txt"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")
    result = fetch_fn(url)
    cache_file.write_text(result, encoding="utf-8")
    return result


def cached_fetch_url(lab_project_path: Path, session_id: str, url: str) -> str:
    return cached_fetch(lab_project_path, session_id, url, fetch_url)


def cached_fetch_pdf(lab_project_path: Path, session_id: str, url: str) -> str:
    # Caches extracted text (what agents read), not raw PDF bytes.
    return cached_fetch(lab_project_path, session_id, url, fetch_pdf)
