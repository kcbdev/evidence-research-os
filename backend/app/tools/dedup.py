"""Source-independence clustering (PBI-043, guide Task 32), generalized
to claims/ideas in PBI-075 (guide Task 52).

Union-find over cosine similarity — no clustering library at this scale
(dozens to low-hundreds of objects). Pure functions on (id, text) pairs;
the graph node builds the texts and writes back. Runs as a post-run hook
in final_output, never in the research hot path.
"""
import numpy as np

DEDUP_THRESHOLD = 0.92

# PBI-075: slightly lower than the 0.92 used for sources — claim/idea
# restatement is less likely to be near-verbatim than source mirroring,
# so a stricter cutoff would miss real duplicates.
CLAIM_IDEA_THRESHOLD = 0.90


def cluster_objects(objects_with_text: list[tuple[str, str]],
                    threshold: float = CLAIM_IDEA_THRESHOLD,
                    embed_fn=None) -> dict[str, str]:
    """{object_id: canonical_object_id}. Canonical = min id of the set
    (deterministic across runs). embed_fn injectable for tests; default
    is the Tier-3 embedder, resolved at call time so the seam stays
    mockable."""
    if not objects_with_text:
        return {}
    if embed_fn is None:
        from app.tools.semantic_index import embed as embed_fn
    ids = [oid for oid, _ in objects_with_text]
    vecs = np.array([embed_fn(text)
                     for _, text in objects_with_text], dtype=float)
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # empty text: zero vector, similar to nothing
    sim = (vecs / norms) @ (vecs / norms).T

    parent = {i: i for i in ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            if sim[i][j] >= threshold:
                ri, rj = find(ids[i]), find(ids[j])
                if ri != rj:
                    parent[ri] = rj

    sets: dict[str, list[str]] = {}
    for i in ids:
        sets.setdefault(find(i), []).append(i)
    out = {}
    for members in sets.values():
        canonical = min(members)
        for m in members:
            out[m] = canonical
    return out


def cluster_sources(sources_with_summaries: list[tuple[str, str]],
                    threshold: float = DEDUP_THRESHOLD,
                    embed_fn=None) -> dict[str, str]:
    """{source_id: canonical_source_id}. Unchanged PBI-043 behavior —
    now a thin wrapper over the generalized union-find."""
    return cluster_objects(sources_with_summaries, threshold, embed_fn)
