"""Tool dispatch for Tier A custom roles (PBI-058).

Name → callable registry over EXISTING tools only (no new
integrations in this PBI). Signatures vary across tools, so each
entry is an adapter taking a context dict
{lab_project_path, project_id, session_id, store} plus the model's
JSON args. Deliberately excluded (documented, not forgotten):
- raw fetch_url/fetch_pdf (the PBI-009 ban: all fetching goes through
  the cache — `fetch_url` here IS the cached variant),
- search_web (does not exist in this codebase),
- citation_verify's check_* trio (pair-level calls that don't fit a
  ReAct line protocol; a future PBI can add an `audit_claim` adapter).
"""
import json
from app.store.lab_project import LabProjectStore
from app.tools.blackboard import retrieve_evidence, store_source
from app.tools.cache import cached_fetch_url
from app.tools.grep_project import grep_project
from app.tools.keyword_index import keyword_search
from app.tools.semantic_index import semantic_search


def _project_dir(ctx: dict):
    from pathlib import Path
    return Path(ctx["lab_project_path"]) / ctx["project_id"]


def _fetch_url(ctx, url: str) -> str:
    return cached_fetch_url(_project_dir(ctx), ctx["session_id"], url)


def _grep(ctx, pattern: str, glob: str = "*.yaml") -> str:
    return grep_project(str(_project_dir(ctx)), pattern, glob)


def _keyword(ctx, query: str, limit: int = 10) -> str:
    return json.dumps(keyword_search(_project_dir(ctx), query, limit))


def _semantic(ctx, query: str, limit: int = 10) -> str:
    return json.dumps(semantic_search(
        _project_dir(ctx), query, limit,
        project_id=ctx["project_id"]))


def _retrieve(ctx, claim_id: str) -> str:
    store = ctx.get("store")
    if store is None:
        store = LabProjectStore(ctx["lab_project_path"],
                                ctx["project_id"])
    return json.dumps([e.model_dump(mode="json")
                       for e in retrieve_evidence(store, claim_id)])


def _store(ctx, source_json: str) -> str:
    from app.models.evidence import Source
    store = ctx.get("store")
    if store is None:
        store = LabProjectStore(ctx["lab_project_path"],
                                ctx["project_id"])
    data = json.loads(source_json)
    source = store_source(store, Source(**data))
    return json.dumps(source.model_dump(mode="json"))


TOOLS = {
    "grep_project": (_grep, "(pattern, glob='*.yaml') — ripgrep over project YAML"),
    "fetch_url": (_fetch_url, "(url) — cached web fetch, always through the tool-output cache"),
    "keyword_search": (_keyword, "(query, limit=10) — BM25 over claims/evidence/ideas"),
    "semantic_search": (_semantic, "(query, limit=10) — vector search, this project"),
    "retrieve_evidence": (_retrieve, "(claim_id) — evidence units supporting a claim"),
    "store_source": (_store, "(source_json) — persist a Source object (validated, committed)"),
}


def get_tools_for_names(names: list[str]) -> dict:
    """Resolve tool names to callables. Unknown names ValueError naming
    the tool — called at COMPILE time so bad methodologies fail before
    any run exists."""
    resolved = {}
    for name in names:
        if name not in TOOLS:
            raise ValueError(
                f"unknown tool '{name}' (available: "
                f"{', '.join(sorted(TOOLS))})")
        resolved[name] = TOOLS[name][0]
    return resolved


def tool_catalog(names: list[str]) -> str:
    """Prompt-ready tool listing for the ReAct loop."""
    lines = ["TOOLS (reply with TOOL lines, then FINAL):"]
    for name in names:
        lines.append(f"- {name}{TOOLS[name][1]}")
    lines.append("Line protocol: `TOOL: <name> | <json args>` "
                 "(e.g. TOOL: grep_project | "
                 "{\"pattern\": \"microbe\"}), or `FINAL: <result>`.")
    return "\n".join(lines)
