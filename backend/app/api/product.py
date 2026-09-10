"""Product-note handoff surface (PBI-049).

Small, explicit: notes are project objects (git-committed like all
objects), ids server-minted (N-001…). Empty notes 422 — a blank
product note is a misclick, not content.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from app.api.lab_projects import _root, _store
from app.models.evidence import ProductNote

router = APIRouter()


@router.get("/{project_id}/product-notes")
def list_product_notes(project_id: str, request: Request):
    store = _store(_root(request), project_id)
    return [n.model_dump(mode="json") for n in store.list_product_notes()]


@router.post("/{project_id}/product-notes", status_code=201)
def add_product_note(project_id: str, payload: dict, request: Request):
    store = _store(_root(request), project_id)
    note_text = ((payload or {}).get("note") or "").strip()
    if not note_text:
        raise HTTPException(status_code=422,
                            detail="note must be non-empty")
    n = len(store.list_product_notes()) + 1
    note = ProductNote(id=f"N-{n:03d}", lab_project_id=project_id,
                       note=note_text,
                       linked_area=(payload or {}).get("linked_area"),
                       created_at=datetime.now(timezone.utc))
    store.write_product_note(note)
    return note.model_dump(mode="json")
