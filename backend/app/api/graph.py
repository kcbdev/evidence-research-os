"""Evidence-graph read model (PBI-045).

Read-only node/edge data for the explorer. Nodes carry display fields
(title/url/excerpt) as a compatible superset of the API Reference shape
so the explorer needs no follow-up fetches. Edges: evidence→claim
supports, source→claim contradicts (opposing_sources), source→evidence
references (containment). status_filter restricts to matching claims
AND their neighborhood.
"""
from fastapi import APIRouter, Request
from app.api.lab_projects import _root, _store

router = APIRouter()


@router.get("/{project_id}/graph")
def get_graph(project_id: str, request: Request,
              status_filter: str | None = None):
    store = _store(_root(request), project_id)
    claims = store.list_claims()
    if status_filter:
        wanted = {s.strip() for s in status_filter.split(",") if s.strip()}
        claims = [c for c in claims if c.status in wanted]
    keep_claims = {c.id for c in claims}
    evidence = [e for e in store.list_evidence()
                if set(e.supports) & keep_claims]
    source_ids: set[str] = set()
    for c in claims:
        source_ids.update(c.supporting_sources)
        source_ids.update(c.opposing_sources)
    for e in evidence:
        source_ids.add(e.source_id)
    sources = {}
    for sid in sorted(source_ids):
        try:
            sources[sid] = store.read_source(sid)
        except FileNotFoundError:
            continue  # dangling link: absent, not fatal

    nodes = ([{"id": c.id, "type": "claim", "status": c.status,
               "statement": c.statement} for c in claims]
             + [{"id": sid, "type": "source",
                 "title": sources[sid].title, "url": sources[sid].url}
                for sid in sources]
             + [{"id": e.id, "type": "evidence",
                 "excerpt": e.text_reference, "strength": e.strength}
                for e in evidence])
    edges = []
    for e in evidence:
        if e.source_id in sources:
            edges.append({"from": e.source_id, "to": e.id,
                          "relation": "references"})
        for cid in e.supports:
            if cid in keep_claims:
                edges.append({"from": e.id, "to": cid,
                              "relation": "supports"})
    for c in claims:
        for sid in c.opposing_sources:
            if sid in sources:
                edges.append({"from": sid, "to": c.id,
                              "relation": "contradicts"})
    return {"nodes": nodes, "edges": edges}
