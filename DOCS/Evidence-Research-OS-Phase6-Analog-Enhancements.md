# Evidence Research OS — Implementation Guide (Phase 6: Analog-Derived Enhancements)

Continues the task numbering from Phase 5b (ends at 45). Implements every row from `Evidence-Research-OS-Feature-Extraction-v1.md`, in that doc's cheapest-first order. Prerequisite: Phases 1-5 built; Phase 5b optional (nothing here depends on Tier A/B/C authoring).

---

## Step 1 (cheapest-first) — Parallel targeted research

### Task 46: Concurrency in `targeted_research` (performance)

Replace the Phase 1 stub's serial loop (`app/graph/nodes.py`):

```python
def targeted_research(state):
    import asyncio
    from app.agents import scientist, investigator, skeptic
    store = LabProjectStore(ROOT, state["lab_project_id"])

    AGENT_MAP = {"scientist": scientist, "investigator": investigator, "skeptic": skeptic}

    async def run_task(task):
        agent = AGENT_MAP[task.assigned_agent]
        return await agent.investigate_task(task.question, task.required_sources)

    results = asyncio.run(asyncio.gather(*[run_task(t) for t in state["pending_tasks"]]))
    state["budget"]["rounds_used"] += 1
    state["budget"]["calls_used"] += len(state["pending_tasks"])
    # ... write results into evidence graph as before ...
    state["pending_tasks"] = []
    return state
```

Each agent module needs an async `investigate_task` (mirrors the sync `investigate` from Phase 1's `independent_first_pass`, just callable concurrently). No new files — this is a direct edit to Task 7's node plus small additions to `app/agents/{scientist,investigator,skeptic}.py`.

**Validate:** run a Lab Project with 3+ open contradictions, confirm wall-clock time for `targeted_research` doesn't scale linearly with task count.

---

## Step 2 — Consensus meter + search-scope toggle (UX)

### Task 47: Consensus computation (backend)

```python
# app/store/lab_project.py — add method
def compute_consensus(self, claim: Claim) -> dict:
    support_weight = sum(self.read_source(sid).quality_tier for sid in claim.supporting_sources)
    oppose_weight = sum(self.read_source(sid).quality_tier for sid in claim.opposing_sources)
    total = support_weight + oppose_weight
    return {
        "supporting_weight": support_weight,
        "opposing_weight": oppose_weight,
        "percent_support": round(support_weight / total * 100, 1) if total else None,
    }
```

Add `"consensus": store.compute_consensus(claim)` to the `GET /claims/{claim_id}` response body (extends the schema in `Evidence-Research-OS-API-Reference-v1.md`'s Claims section).

### Task 48: `ConsensusMeter` component (frontend)

```tsx
// frontend/src/components/ConsensusMeter.tsx
export function ConsensusMeter({ supportingWeight, opposingWeight }: {
  supportingWeight: number; opposingWeight: number;
}) {
  const total = supportingWeight + opposingWeight;
  const pct = total ? (supportingWeight / total) * 100 : 50;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
      <div className="bg-emerald-500" style={{ width: `${pct}%` }} />
      <div className="bg-amber-500" style={{ width: `${100 - pct}%` }} />
    </div>
  );
}
```

Add alongside `ClaimConfidenceBar` in `EvidenceTraceModal` and the Claims table row — not instead of it, the multidimensional confidence breakdown (spec §4.2) stays as the rigorous view, this is the at-a-glance one.

### Task 49: Search-scope toggle

Extend the run-start payload (API reference's `POST /runs` body):
```json
{"search_scope": "open_web | academic_only | peer_reviewed_only"}
```

```python
# app/tools/search.py
def search_web(query: str, scope: str = "open_web"):
    if scope == "academic_only":
        return search_academic(query)
    results = _raw_search_web(query)
    if scope == "peer_reviewed_only":
        results = [r for r in results if r.get("kind") in ("systematic_review", "primary_paper")]
    return results
```

Frontend: add a `Select` to the run-start dialog (Frontend UX Spec §5a) — one more field, defaults to `open_web`.

---

## Step 3 — Coverage-check node + Meta-Reviewer role (functionality)

### Task 50: `coverage_check` node

```python
def coverage_check(state):
    store = LabProjectStore(ROOT, state["lab_project_id"])
    cited_ids = {eid for claim in store.list_claims() for eid in claim.supporting_sources + claim.opposing_sources}
    all_evidence = store.list_evidence()  # add this accessor alongside list_claims/list_sources
    unused = [e for e in all_evidence if e.id not in cited_ids]
    if unused:
        task = Task(
            id=next_id("R"),
            question=f"Evidence {[e.id for e in unused]} was retrieved but unused — "
                       "new claim, or does it reveal a gap the plan missed?",
            reason="coverage_check", required_sources=[], assigned_agent="scientist",
        )
        store.write_task(task)
        state["pending_tasks"].append(task)
    return state
```

Graph placement: insert between `evidence_adjudication` and `synthesis` (spec Phase 1 §6.2 node graph) — a real gap should feed back into `targeted_research`, not silently pass through to synthesis. Add the conditional edge accordingly.

### Task 51: Meta-Reviewer role

```python
# app/agents/prompts.py, add
META_REVIEWER_SYSTEM = """
You review the fully synthesized report as a whole — not individual claims,
the Skeptic already did that. Check: does this report actually answer the
original question? Are there coverage gaps? Does the narrative overstate
certainty relative to the underlying claims' confidence scores? Flag issues.
You do not rewrite the report yourself.
"""
```

```python
def meta_review(state):
    store = LabProjectStore(ROOT, state["lab_project_id"])
    report = (store.path / "output" / "report.md").read_text()
    findings = call_model(META_REVIEWER_MODEL, META_REVIEWER_SYSTEM, report)
    state["meta_review_passed"] = "MAJOR_GAP" not in findings  # refine to structured output later
    if not state["meta_review_passed"]:
        store.write_decision(Decision(id=next_id("D"), what="Meta-review flagged issues",
                                       why=findings, timestamp=now()))
    return state
```

Graph placement: after `synthesis`, before `citation_audit`. Conditional edge loops back to `synthesis` (with the findings appended as context) if `meta_review_passed` is false. **Model assignment note:** this is a 6th role slot — the judge-exclusion validation (Phase 1 Task 9) should extend to also exclude the Meta-Reviewer's model from the council, same self-preference-bias reasoning.

---

## Step 4 — Claim/Idea deduplication extension (functionality)

### Task 52: Generalize the clustering function

```python
# app/tools/dedup.py — rename/generalize from Phase 3 Task 32
def cluster_objects(objects_with_text: list[tuple[str, str]], threshold: float = 0.90):
    """Same union-find-over-cosine-similarity as cluster_sources. Threshold
    is slightly lower than the 0.92 used for sources — claim/idea restatement
    is less likely to be near-verbatim than source mirroring, so a stricter
    cutoff would miss real duplicates."""
    # ...identical body to Phase 3's cluster_sources...
```

```python
def dedup_claims(store: LabProjectStore):
    claims = store.list_claims()
    clusters = cluster_objects([(c.id, c.statement) for c in claims])
    # write a duplicates.yaml note rather than adding a field to Claim —
    # Claim's schema wasn't designed around this, don't overload it
    write_duplicate_report(store, "claims", clusters)

def dedup_ideas(store: LabProjectStore):
    ideas = store.list_ideas()
    clusters = cluster_objects([(i.id, i.statement) for i in ideas])
    write_duplicate_report(store, "ideas", clusters)
```

Run both as background jobs (same cadence as Phase 3's source clustering, off the critical path) rather than inline in the graph.

---

## Step 5 — Tournament ranking + ranked Ideas view (functionality + UX)

### Task 53: Elo scoring

```python
# app/models/evidence.py — add field
class Idea(BaseModel):
    # ...existing fields...
    elo_score: float = 1200.0
```

```python
# app/agents/tournament.py
import random

def elo_update(winner: float, loser: float, k: float = 32) -> tuple[float, float]:
    expected = 1 / (1 + 10 ** ((loser - winner) / 400))
    return winner + k * (1 - expected), loser - k * (1 - expected)

def run_tournament(ideas: list[Idea], model_id: str, rounds: int = 3) -> list[Idea]:
    for _ in range(rounds):
        random.shuffle(ideas)
        for a, b in zip(ideas[::2], ideas[1::2]):
            winner_id = judge_pairwise(a, b, model_id)  # model call: which idea is stronger, and why
            if winner_id == a.id:
                a.elo_score, b.elo_score = elo_update(a.elo_score, b.elo_score)
            else:
                b.elo_score, a.elo_score = elo_update(b.elo_score, a.elo_score)
    return ideas
```

### Task 54: `tournament_ranking` node

Graph placement (Brainstorm-mode graph, spec Phase 2): after `novelty_check`, before `adversarial_review` — only runs when `len(ideas) >= 2` for the current run, otherwise no-op passthrough.

### Task 55: API + UI

`GET /lab-projects/{id}/ideas` gains `elo_score` in the response and a `?sort=elo` query param (extends the endpoint already in the API reference).

Ideas board (Frontend UX Spec §7): add a view toggle — `Kanban | Ranked`. Ranked view: flat list sorted by `elo_score` desc, same card content, no columns.

---

## Step 6 — Time-travel run debugging (UX, built on existing checkpoints — no new storage)

### Task 56: Checkpoint state endpoint

```python
# app/api/runs.py, add
@router.get("/lab-projects/{project_id}/runs/{run_id}/checkpoints/{node_id}")
def get_checkpoint_state(project_id: str, run_id: str, node_id: str):
    saver = SqliteSaver.from_conn_string(str(checkpoint_path_for(project_id)))
    for cp in saver.list(config={"configurable": {"thread_id": run_id}}):
        if cp.metadata.get("node") == node_id:
            return cp.checkpoint["channel_values"]
    raise HTTPException(404, "No checkpoint for that node")
```

This reads data LangGraph's `SqliteSaver` already persists (Phase 1 Task 6) — no new write path, purely additive read access.

### Task 57: Clickable feed entries (frontend)

`RunActivityFeed` (Frontend UX Spec §9): each entry becomes clickable, opens a `Sheet` showing the full state JSON at that node transition (a simple formatted `<pre>` or a read-only CodeMirror JSON view — reuse the CodeMirror dependency already pulled in for the No-Code Builder's expression editor, don't add a second JSON-viewer library for this).

---

## Step 7 — Closed-corpus mode + perspective-guided planning (functionality)

### Task 58: Pinned-sources mode

Run-start payload addition: `"pinned_sources": ["S-001", "S-004"]` (optional).

```python
# app/graph/compile.py or wherever tool availability is resolved per-run
def get_enabled_tools(methodology, pinned_sources: list[str] | None) -> set[str]:
    tools = set(methodology.tools.enabled)
    if pinned_sources:
        tools -= {"search_web", "search_academic"}  # Investigator can't go find new sources
    return tools
```

When `pinned_sources` is set, `plan` should also seed the evidence graph with those sources directly (skip discovery, go straight to evidence extraction against the given list).

### Task 59: Perspective-guided planning

```python
# app/agents/prompts.py, addendum to the existing PLAN prompt (Phase 1)
SCIENTIST_PLANNING_ADDENDUM = """
Before decomposing into sub-questions, generate 2-4 distinct perspectives
relevant to this question's domain — e.g. technical feasibility, market/
commercial angle, contrarian/skeptical framing, or philosophical/ethical
angle where relevant (STORM-style). Each perspective should surface
different sub-questions than a single-angle decomposition would.
"""
```

Append this to the existing `plan` node's Scientist call (Phase 1 Task 7) — no new node, just a richer prompt. Particularly relevant given your CS+math+marketing+product+philosophy scope (vision doc) — a single-angle decomposition undersells exactly the cross-domain breadth you designed this system for.

---

## Performance note: retrieval provider (not step-ordered — a config change, do whenever convenient)

Swap `app/tools/fetch.py`'s `httpx`+`trafilatura` combo for a provider built for fresh, full-content retrieval (Firecrawl or Exa) if/when shallow-scrape quality becomes a bottleneck — keep the function signature identical (`fetch_url(url) -> str`) so this is a drop-in swap, not a refactor. Not urgent enough to block anything above; do it when you notice `fetch_url` output quality actually limiting Investigator's evidence quality, not preemptively.

---

## Cumulative validation

| Step | Done when |
|---|---|
| 1 | `targeted_research` wall-clock time doesn't scale linearly with task count |
| 2 | A claim's consensus meter renders correctly against real supporting/opposing sources; a run started with `peer_reviewed_only` actually excludes non-peer-reviewed results |
| 3 | A deliberately-incomplete run surfaces at least one coverage-check task; a deliberately-incoherent draft report gets caught by Meta-Reviewer before citation audit |
| 4 | Two near-duplicate ideas from separate Brainstorm runs show up in the same duplicate cluster |
| 5 | A tournament run on 4+ ideas produces a stable Elo ordering across repeated runs (same ideas, same relative order) |
| 6 | Clicking any run-history entry shows the exact state at that point, matching what actually happened |
| 7 | A pinned-sources run makes zero web-search tool calls; a perspective-guided plan visibly produces sub-questions from more than one angle |

## What this doesn't touch

None of Phase 6 changes the Methodology schema, the graph compiler, or the storage layer's fundamental shape — every task here is either a new optional node, a new optional tool parameter, or a UI addition to an existing view. Nothing here requires re-validating Phases 1-5's own done-conditions; they still hold independently.
