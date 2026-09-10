# Evidence Research OS — Implementation Guide (Phases 2-4)

Continues directly from `Evidence-Research-OS-Implementation-Guide-Phase0-1.md`. Task numbers match `Evidence-Research-OS-Implementation-Plan-v1.md`. Don't start any of this until the Phase 1 validation checklist is actually checked off against a real topic.

---

## Phase 2 — Brainstorm mode

### Task 21: Idea schema (`app/models/evidence.py`, add)

```python
IdeaStatus = Literal["proposed", "under_skeptic_review", "promoted_to_claim", "rejected"]

class NoveltyCheck(BaseModel):
    status: Literal["novel", "adjacent", "duplicate"]
    against: list[str] = []   # Idea IDs this was compared against

class ProposedExperiment(BaseModel):
    hypothesis: str
    falsification_condition: str
    feasibility: Literal["high", "medium", "low"]

class Idea(BaseModel):
    id: str
    type: Literal["idea"] = "idea"
    statement: str
    novelty_check: Optional[NoveltyCheck] = None
    proposed_experiment: Optional[ProposedExperiment] = None
    status: IdeaStatus = "proposed"
```

Add the matching store method:

```python
def write_idea(self, i: Idea): self._write("ideas", i.id, i, f"idea: {i.id} [{i.status}]")
def list_ideas(self) -> list[Idea]: return self._list("ideas", Idea)
```

Remember to create the `ideas/` subdir in `_ensure_layout`.

### Task 22: Ideator/Explorer agent (`app/agents/prompts.py`, add)

```python
IDEATOR_SYSTEM = """
You are the Ideator/Explorer. Your job is NOT to summarize existing
literature — the Investigator already did that. Your job is to propose
genuinely novel angles, contrarian framings, or unexplored combinations
related to the question, and for each one, specify a concrete experiment
that would validate or falsify it. A proposal with no falsification
condition is not a hypothesis, it's a wish — reject your own ideas that
fail this test before submitting them.
"""
```

```python
# app/agents/ideator.py
from app.agents.client import call_model
from app.agents.prompts import IDEATOR_SYSTEM

def propose(question: str, existing_ideas: list[str], model_id: str) -> dict:
    context = "\n".join(f"- {i}" for i in existing_ideas) or "(none yet)"
    user = f"Question: {question}\n\nExisting ideas so far:\n{context}\n\nPropose a new angle."
    return call_model(model_id, IDEATOR_SYSTEM, user)  # parse into Idea fields
```

### Task 23: `NOVELTY_CHECK` node (`app/graph/nodes.py`, add)

```python
def novelty_check(state):
    """Replaces conflict_detection when state['mode'] == 'brainstorm'."""
    store = LabProjectStore(ROOT, state["lab_project_id"])
    existing = [i.statement for i in store.list_ideas()]
    # embed-and-compare is overkill here for a handful of ideas —
    # ask the Skeptic model directly: is this a duplicate/adjacent/novel idea
    # against this list. Only reach for LanceDB similarity once Phase 3 is in
    # place and the idea count actually gets large.
    return state
```

### Task 24: Mode-conditional Skeptic rubric (`app/agents/skeptic.py`)

```python
SKEPTIC_RESEARCH_RUBRIC = """...adversarial review of citations/methodology..."""
SKEPTIC_BRAINSTORM_RUBRIC = """
You are reviewing an IDEA, not a claim. Do not ask "is this cited" — ask:
is this actually novel or a restatement of something obvious? Is the
proposed experiment well-designed to falsify the thesis, or does it just
confirm what's already assumed? Would a null result actually be
informative, or is the experiment unfalsifiable as written?
"""

def get_rubric(mode: str) -> str:
    return SKEPTIC_BRAINSTORM_RUBRIC if mode == "brainstorm" else SKEPTIC_RESEARCH_RUBRIC
```

### Task 25: Wire `mode` through the stack

- `project.yaml`: already has `mode` field (Phase 1 `ProjectMeta`) — no change needed
- Graph: `build_graph` picks node set/edges conditionally:

```python
def build_graph(lab_project_path, mode: str):
    g = StateGraph(LabProjectState)
    # ...same nodes as Phase 1...
    if mode == "brainstorm":
        g.add_node("novelty_check", nodes.novelty_check)
        g.add_edge("independent_first_pass", "novelty_check")
        g.add_edge("novelty_check", "adversarial_review")
    else:
        g.add_edge("independent_first_pass", "evidence_extraction")
        g.add_edge("evidence_extraction", "conflict_detection")
        # ...as in Phase 1
    ...
```

- API: `POST /runs` payload already accepts a `mode` field from Phase 1 spec — just validate it's one of the two literals before dispatching.

### Task 26-27: API + UI

```python
# app/api/ideas.py
@router.get("/lab-projects/{project_id}/ideas")
def list_ideas(project_id: str, status: str | None = None):
    store = LabProjectStore(ROOT, project_id)
    ideas = store.list_ideas()
    return [i for i in ideas if status is None or i.status == status]
```

```tsx
// frontend/src/app/lab/[id]/ideas/page.tsx
// Kanban columns: proposed | under_skeptic_review | promoted_to_claim | rejected
// Each card: statement, novelty_check.status badge, proposed_experiment.falsification_condition
// Drag-and-drop is nice-to-have — a simple status-change button per card is enough for v1
```

**Phase 2 done when:** an Idea survives Skeptic review with a stated falsification condition, and you can manually click "promote to claim" which writes a new `Claim` object referencing the idea, then run a normal Research-mode pass on it.

---

## Phase 3 — Full citation audit + retrieval indices

### Task 28: 3-stage `citation_verify` tool (`app/tools/citation_verify.py`)

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class AuditResult:
    stage: Literal["existence", "pincite", "support_match"]
    status: Literal["PASS", "WARNING", "FAIL"]
    detail: str

def check_existence(source_url: str) -> AuditResult:
    import httpx
    try:
        r = httpx.head(source_url, timeout=10, follow_redirects=True)
        ok = r.status_code < 400
    except Exception:
        ok = False
    return AuditResult("existence", "PASS" if ok else "FAIL",
                        "" if ok else f"Source unreachable: {source_url}")

def check_pincite(evidence, source_text: str) -> AuditResult:
    # does the claimed page/section actually exist in the fetched source?
    section = evidence.location.get("section")
    if section and section.lower() not in source_text.lower():
        return AuditResult("pincite", "WARNING", f"Section '{section}' not found in source text")
    return AuditResult("pincite", "PASS", "")

def check_support_match(claim_statement: str, evidence_text_reference: str, model_id: str) -> AuditResult:
    """The SourceCheckup failure mode: source is real and on-topic but
    doesn't actually say what's claimed. This needs a model call, not
    string matching — ask a model NOT in the council/judge rotation
    whether the excerpt actually supports the specific claim statement."""
    from app.agents.client import call_model
    prompt = f"""Claim: "{claim_statement}"
Cited excerpt: "{evidence_text_reference}"

Does this excerpt actually support the specific claim, or is it
merely topically related? Answer PASS, WARNING, or FAIL with one sentence."""
    result = call_model(model_id, "You are a strict citation auditor.", prompt)
    status = "PASS" if result.strip().startswith("PASS") else (
             "FAIL" if result.strip().startswith("FAIL") else "WARNING")
    return AuditResult("support_match", status, result)
```

### Task 29: Extend `CITATION_AUDIT` node

```python
def citation_audit(state):
    store = LabProjectStore(ROOT, state["lab_project_id"])
    all_results = []
    for claim in store.list_claims():
        for ev in evidence_for_claim(store, claim.id):
            source = store.read_source(ev.source_id)
            source_text = cached_fetch(store.path, source.url, fetch_url)
            results = [
                check_existence(source.url),
                check_pincite(ev, source_text),
                check_support_match(claim.statement, ev.text_reference, AUDITOR_MODEL),
            ]
            all_results.append({"claim_id": claim.id, "evidence_id": ev.id, "checks": results})
    write_audit_run(store, all_results)
    state["audit_passed"] = all(r["status"] != "FAIL" for run in all_results for r in run["checks"])
    return state
```

Store the per-stage results, not just a pass/fail rollup — the UI (task 34) needs to show *which* stage failed.

### Task 30: Tantivy index (`app/tools/keyword_index.py`)

```python
import tantivy
from pathlib import Path

def build_schema():
    sb = tantivy.SchemaBuilder()
    sb.add_text_field("id", stored=True, tokenizer_name="raw")
    sb.add_text_field("body", stored=True)
    return sb.build()

def rebuild_index(lab_project_path: Path):
    idx_dir = lab_project_path / ".index" / "tantivy"
    idx_dir.mkdir(parents=True, exist_ok=True)
    index = tantivy.Index(build_schema(), path=str(idx_dir))
    writer = index.writer()
    for subdir in ["claims", "evidence", "ideas"]:
        for f in (lab_project_path / subdir).glob("*.yaml"):
            writer.add_document(tantivy.Document(id=f.stem, body=f.read_text()))
    writer.commit()

def keyword_search(lab_project_path: Path, query: str, limit: int = 10) -> list[str]:
    index = tantivy.Index(build_schema(), path=str(lab_project_path / ".index" / "tantivy"))
    index.reload()
    searcher = index.searcher()
    parsed = index.parse_query(query, ["body"])
    return [searcher.doc(addr)["id"][0] for _, addr in searcher.search(parsed, limit).hits]
```

Trigger `rebuild_index` from a background job (simple: on every N writes, or a scheduled task) — not inline on every single write, that's wasteful for a per-file-write cadence.

### Task 31: LanceDB + fastembed (`app/tools/semantic_index.py`)

```python
import lancedb
from fastembed import TextEmbedding
from pathlib import Path

_embedder = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")  # local, CPU, ONNX — no API call per file

def embed(text: str) -> list[float]:
    return list(_embedder.embed([text]))[0].tolist()

def get_table(lab_project_path: Path):
    db = lancedb.connect(str(lab_project_path / ".index" / "lancedb"))
    if "evidence_units" not in db.table_names():
        return db.create_table("evidence_units", data=[
            {"id": "seed", "vector": embed("seed"), "text": "seed", "project_id": "seed"}
        ])
    return db.open_table("evidence_units")

def index_evidence_unit(lab_project_path: Path, id: str, text: str, project_id: str):
    table = get_table(lab_project_path)
    table.add([{"id": id, "vector": embed(text), "text": text, "project_id": project_id}])

def semantic_search(lab_project_path: Path, query: str, limit: int = 10):
    table = get_table(lab_project_path)
    return table.search(embed(query)).limit(limit).to_list()
```

### Task 32: Source-independence clustering (background job, `app/tools/dedup.py`)

```python
import numpy as np
from app.tools.semantic_index import embed

def cluster_sources(sources_with_summaries: list[tuple[str, str]], threshold: float = 0.92):
    """Simple union-find over cosine similarity — no need for a full
    clustering library at this scale (dozens to low-hundreds of sources
    per Lab Project). Returns {source_id: canonical_source_id}."""
    ids, texts = zip(*sources_with_summaries)
    vecs = np.array([embed(t) for t in texts])
    norms = vecs / np.linalg.norm(vecs, axis=1, keepdims=True)
    sim = norms @ norms.T

    parent = {i: i for i in ids}
    def find(x):
        while parent[x] != x: x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[ra] = rb

    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            if sim[i][j] >= threshold:
                union(ids[i], ids[j])

    return {i: find(i) for i in ids}
```

Run this as a scheduled/background job, write results back into each `Source.independence_cluster` field — never inline in the research graph's critical path (spec explicitly calls this out).

### Task 33-34: API + UI

```python
@router.get("/lab-projects/{project_id}/audits/latest")
def latest_audit(project_id: str):
    # read the most recent audits/*.yaml, return per-claim/per-stage results
    ...
```

Audit page: table of claims, expandable per-stage PASS/WARN/FAIL with the `detail` string from `AuditResult` shown on click — the whole point is surfacing *which* check failed, not just a red/green claim.

**Phase 3 done when:** a claim citing a real, reachable source that doesn't actually say what's claimed gets flagged FAIL specifically at `support_match`, distinct from a claim with a broken link (FAIL at `existence`).

---

## Phase 4 — Cross-project search, Academic tier, product handoff

### Task 35: Cross-Lab-Project semantic search

Shift the LanceDB connection from per-project to a single shared instance, with `project_id` as a filterable column (already in the schema from task 31):

```python
def cross_project_search(all_labs_root: Path, query: str, limit: int = 20):
    db = lancedb.connect(str(all_labs_root / ".shared-index" / "lancedb"))
    table = db.open_table("evidence_units")
    return table.search(embed(query)).limit(limit).to_list()
```

This requires each Lab Project's `index_evidence_unit` calls to write into the shared table (change task 31's connection path once this phase starts) rather than a per-project one. Keep the per-project Tantivy indices separate — cross-project keyword search isn't a stated need yet, don't build it speculatively.

### Task 36: Academic/Publication mode nodes

```python
def methodology_analysis(state):
    """Only wired into the graph when project.yaml mode is escalated to
    'academic' — not part of the default research/brainstorm graphs."""
    ...

def reproducibility_audit(state):
    ...
```

Add these as an optional extra segment inserted between `evidence_adjudication` and `synthesis`, gated by a third mode value (`"academic"`) added to the `mode` literal — don't fold this into the default Research graph, it's meaningfully more expensive and only worth running when you're actually aiming for publication-grade rigor.

### Task 37: Product notes

```python
class ProductNote(BaseModel):
    id: str
    lab_project_id: str
    note: str
    linked_area: Optional[str] = None   # e.g. "runfusion", matches your /areas/ slugs
    created_at: datetime
```

```python
@router.post("/lab-projects/{project_id}/product-notes")
def add_product_note(project_id: str, note: ProductNote):
    store = LabProjectStore(ROOT, project_id)
    store._write("product", note.id, note, f"product note: {note.id}")
```

UI: "Promote to product" button on the Output page opens a small form (note text, optional linked `/areas/` slug), posts to the endpoint above.

### Task 38: `labs.kcb.ma` handoff

Don't build this from scratch — check the `kcb-labs` Keystatic implementation spec first (already produced, referenced in your KCB Labs area file) for the actual content format `labs.kcb.ma` expects. This phase's job is narrow: take a Lab Project's `output/report.md` + relevant `product/*.yaml` notes and shape them into whatever Keystatic's project-entry schema requires — a mapping/export function, not a new publishing pipeline.

**Phase 4 done when:** a cross-project semantic query returns a relevant result from a different Lab Project than the one you're currently in, and one Lab Project's output has actually been pushed toward `labs.kcb.ma` without manual reformatting.

---

## Cumulative validation note

Each phase's "done" condition builds on the previous ones being real, not simulated — don't fake Phase 3 citation-audit results to unblock Phase 4 UI work. If a phase's done-condition can't be met, that's signal the phase isn't finished, not a reason to relax the condition.
