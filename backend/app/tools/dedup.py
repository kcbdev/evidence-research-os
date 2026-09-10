"""Source-independence clustering (PBI-043, guide Task 32).

Union-find over cosine similarity (threshold 0.92) — no clustering
library at this scale (dozens to low-hundreds of sources). Pure
function on (id, text) pairs; the graph node builds the texts and
writes back. Runs as a post-run hook in final_output, never in the
research hot path.
"""
import numpy as np

DEDUP_THRESHOLD = 0.92


def cluster_sources(sources_with_summaries: list[tuple[str, str]],
                    threshold: float = DEDUP_THRESHOLD,
                    embed_fn=None) -> dict[str, str]:
    """{source_id: canonical_source_id}. Canonical = min id of the set
    (deterministic across runs). embed_fn injectable for tests; default
    is the Tier-3 embedder, resolved at call time so the seam stays
    mockable."""
    if not sources_with_summaries:
        return {}
    if embed_fn is None:
        from app.tools.semantic_index import embed as embed_fn
    ids = [sid for sid, _ in sources_with_summaries]
    vecs = np.array([embed_fn(text)
                     for _, text in sources_with_summaries], dtype=float)
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
