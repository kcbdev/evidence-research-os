"""Cross-project semantic search (PBI-046).

Read-only over the shared LanceDB table: no refresh, no embedding
beyond the query itself (freshness is per-project — investigator runs
and backfill). Missing table → [] (index simply doesn't exist yet).
"""
from fastapi import APIRouter, HTTPException, Request
from app.api.lab_projects import _root
from app.store.lab_project import LabProjectStore
from app.tools.semantic_index import cross_project_search

router = APIRouter()


@router.get("/search")
def search(q: str, request: Request, limit: int = 20):
    """Semantic query across all Lab Projects' evidence."""
    if not (q or "").strip():
        raise HTTPException(status_code=422, detail="q must be non-empty")
    limit = max(1, min(limit, 100))
    root = _root(request)
    out = []
    for row in cross_project_search(root, q.strip(), limit):
        title = row["project_id"]
        try:
            title = LabProjectStore(root, row["project_id"]).read_meta().title
        except Exception:
            pass  # orphan rows stay addressable by project id
        out.append({"project_id": row["project_id"],
                    "project_title": title,
                    "claim_id": row["id"] if row["id"].startswith("C-")
                    else None,
                    "matching_text": row["text"][:300],
                    "score": round(1.0 / (1.0 + row["distance"]), 4)})
    return out
