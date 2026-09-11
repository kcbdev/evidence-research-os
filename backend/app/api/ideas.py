"""Ideas API (PBI-036, Phase 2 guide Tasks 26-27).

GET list/filter + PATCH status (promote/reject). Promote creates a Claim
carrying promoted_from_idea provenance and returns created_claim_id.
Transition guards: re-promote 409s (no duplicate claims); reject is
idempotent; promote-after-reject is allowed (reconsideration).
"""
from fastapi import APIRouter, HTTPException, Request
from app.models.evidence import Claim
from app.api.lab_projects import _root, _store

router = APIRouter()


@router.get("/{project_id}/ideas")
def list_ideas(project_id: str, request: Request, status: str | None = None):
    """List ideas, optionally filtered by status."""
    store = _store(_root(request), project_id)
    ideas = store.list_ideas()
    if status is not None:
        ideas = [i for i in ideas if i.status == status]
    return [i.model_dump(mode="json") for i in ideas]


@router.patch("/{project_id}/ideas/{idea_id}")
def patch_idea(project_id: str, idea_id: str, payload: dict, request: Request):
    """Update idea status. Accepts: promoted_to_claim | rejected.

    Promote creates a new Claim (supporting_sources=[], INSUFFICIENT_EVIDENCE,
    statement copied from idea) and returns created_claim_id.
    """
    store = _store(_root(request), project_id)
    try:
        idea = store.read_idea(idea_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="idea not found")

    new_status = (payload or {}).get("status")
    if new_status not in ("promoted_to_claim", "rejected"):
        raise HTTPException(
            status_code=422, detail="status must be promoted_to_claim or rejected"
        )

    if new_status == "rejected":
        if idea.status != "rejected":
            idea.status = "rejected"
            store.write_idea(idea)
        return idea.model_dump(mode="json")

    # promoted_to_claim (re-promote 409s — one idea mints one claim)
    if idea.status == "promoted_to_claim":
        raise HTTPException(status_code=409,
                            detail=f"idea {idea_id} already promoted")
    n = len(store.list_claims()) + 1
    claim = Claim(
        id=f"C-{n:03d}",
        statement=idea.statement,
        supporting_sources=[],
        opposing_sources=[],
        promoted_from_idea=idea.id,
    )
    store.write_claim(claim)
    idea.status = "promoted_to_claim"
    store.write_idea(idea)
    return {
        **idea.model_dump(mode="json"),
        "created_claim_id": claim.id,
    }