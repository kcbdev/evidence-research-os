# Evidence Research OS — Technical Specification v1

Single-operator research + brainstorm engine for KCB Labs. One system, many **Lab Projects**; each Lab Project can spawn 1..n downstream projects (ventures, articles, prototypes).

---

## 1. Scope & Non-Goals

**In scope:** CS and closely related fields (math, marketing, product, philosophy-of-AI). Two modes per Lab Project — Deep Research (evidence-grounded) and Brainstorm (creative/divergent). Organized documentation output feeding `labs.kcb.ma`.

**Non-goals (v1):** Not multi-tenant, no auth/billing, no external buyer. Not limited to peer-reviewed sources — grey literature, product analogues, and reasoned argument are first-class evidence types. Academic/Publication-tier rigor (full reproducibility audit) is a later phase, not MVP.

---

## 2. Core Concepts

### 2.1 Lab Project
A subject/workspace. Root unit of persistence, isolation, and context budget. Everything below lives inside one Lab Project directory.

### 2.2 Modes
- **Deep Research** — convergent. Scientist/Investigator/Skeptic council answers "what does the evidence actually say," citation-audited, traceable.
- **Brainstorm** — divergent. Ideator/Explorer proposes novel angles, contrarian framings, and falsifiable experiments. Skeptic's role shifts from "is this citation real" to "is this idea actually novel / does this experiment actually test the thesis."

### 2.3 Evidence graph object types
`Source`, `Claim`, `Evidence`, `Contradiction`, `Experiment`, `Decision`, `Task`, `Idea` (Brainstorm-mode equivalent of Claim — unverified by design, tracked separately so it never gets silently treated as a supported claim).

---

## 3. Agent Roles

| Role | Objective | Notes |
|---|---|---|
| **Supervisor** | Reads blackboard state, routes to next agent/node | LangGraph node, deterministic scheduler (not opportunistic firing) |
| **Scientist** | Decompose question, formulate hypotheses, causal reasoning | Optimized for reasoning depth |
| **Investigator** | Find/retrieve strongest evidence, run targeted follow-ups | Optimized for recall + source quality |
| **Skeptic** | Adversarial review — attack claims (Research mode) or attack idea novelty/experiment design (Brainstorm mode) | Same role, different rubric per mode |
| **Ideator/Explorer** | Propose novel angles, contrarian framings, falsifiable experiments | Brainstorm-mode only; modeled on Co-Scientist's Generation+Evolution agents |
| **Evidence Judge / Adjudicator** | Resolve claim status (SUPPORTED/DISPUTED/etc.) | **Must be a model excluded from council rotation** — self-preference bias risk if the judge ever adjudicates its own council output |
| **Citation Auditor** | 3 sub-checks per claim, not 1 | Existence → pincite/location → support-match (a source can be real and on-topic but not actually say what's claimed) |

---

## 4. Storage & Persistence Layer

**Principle:** filesystem is the source of truth. Every index below is regeneratable from it and gitignored.

### 4.1 Directory layout

```
lab-projects/<slug>/
├── project.yaml                  # metadata, mode history, budget state
├── question.md                   # the research/brainstorm question(s)
├── sources/*.yaml                 # Source objects
├── claims/*.yaml                  # Claim objects (Research mode)
├── ideas/*.yaml                    # Idea objects (Brainstorm mode)
├── evidence/*.yaml                # Evidence units
├── contradictions/*.yaml
├── experiments/*.yaml
├── tasks/*.yaml                    # targeted-delegation queue
├── decisions/                     # episodic memory — durable, one file per adjudication/decision
│   └── D-<n>.yaml
├── debates/                       # raw transcripts — compacted/summarized into decisions/, then discardable
├── audits/                        # citation audit run results
├── product/                       # product-elaboration notes (venture/prototype output)
├── output/
│   ├── report.md
│   ├── references.md
│   └── evidence-audit.md
├── tool_outputs/<session_id>/     # raw tool call results — never loaded raw into agent context
└── .index/                        # DERIVED, gitignored, rebuilt on file change
    ├── tantivy/                   # BM25 keyword index
    └── lancedb/                   # embeddings for dedup + cross-project search
```

### 4.2 Object schemas (YAML)

```yaml
# sources/S-004.yaml
id: S-004
type: source
kind: primary_paper | systematic_review | institutional_report | official_data
  | technical_doc | journalism | expert_commentary | product_analogue | web_content
url: ...
title: ...
retrieved_at: ...
quality_tier: 1-9          # per §9 hierarchy, domain-sensitive
independence_cluster: null  # filled by dedup pass — points to canonical source if this is a mirror
```

```yaml
# claims/C-017.yaml
id: C-017
type: claim
statement: "X significantly improves Y."
supporting_sources: [S-004, S-021]
opposing_sources: [S-031]
status: SUPPORTED | STRONGLY_SUPPORTED | WEAKLY_SUPPORTED | DISPUTED
  | CONTRADICTED | INSUFFICIENT_EVIDENCE | UNVERIFIABLE
confidence:
  source_quality: 0.92
  methodological_strength: 0.84
  independent_confirmation: 0.78
  contradiction_level: 0.22
  overall: 0.84
adjudicated_by: <judge model id>   # never a council member for this claim
```

```yaml
# evidence/E-102.yaml
id: E-102
source_id: S-021
location: {page: 14, section: "Results"}
text_reference: ...        # short excerpt, not full document
supports: [C-017]
evidence_type: empirical | argumentative | analogical
strength: high | medium | low
```

```yaml
# ideas/I-008.yaml  (Brainstorm mode)
id: I-008
statement: "Novel angle / contrarian framing"
novelty_check: {status: novel|adjacent|duplicate, against: [I-002]}
proposed_experiment:
  hypothesis: ...
  falsification_condition: ...   # what would disprove this
  feasibility: high|medium|low
status: proposed | under_skeptic_review | promoted_to_claim | rejected
```

```yaml
# decisions/D-011.yaml  (episodic memory — durable; the transcript that produced it is discardable)
id: D-011
what: "C-017 adjudicated DISPUTED after targeted research R-042"
why: "S-031 (RCT) contradicts S-004/S-021 (observational); no independent confirmation"
timestamp: ...
```

### 4.3 Index layer (Tier 1/2/3 retrieval — all derived, all disposable)

| Tier | Tool | Use |
|---|---|---|
| 1 | ripgrep (MCP tool) | Literal/regex search over all YAML/MD — agent's default, zero setup |
| 2 | Tantivy (BM25) | Ranked keyword search when relevance ordering beats raw grep |
| 3 | LanceDB | Embedded, file-based, vector+FTS in one lib — **only** for source-independence/dedup clustering (§4.2 `independence_cluster`) and cross-Lab-Project search. Embeddings via `fastembed` (local, ONNX, no API round-trip per file) |

Harness rule (from "Is Grep All You Need?"): retrieval loop must be iterative — narrow, read, narrow again — never single-shot. This matters more than which tool sits behind it.

### 4.4 Tool output cache
`tool_outputs/<session_id>/` — every MCP tool call result written here first. Agents read via `tail`/line-range, never receive the raw payload in-context. Before any fetch: check cache keyed by URL/DOI hash — no re-fetching S-021 because an agent forgot it already has it.

---

## 5. Memory & Context Engineering

| Type | What | Where | Lifecycle |
|---|---|---|---|
| Working | Active reasoning buffer | LangGraph state, session-scoped | Discarded after run |
| Semantic | Durable topic facts | Evidence graph (§4.2) | Persistent |
| Episodic | What happened and why | `decisions/` | Persistent; transcripts in `debates/` are compacted into a decision then may be discarded |
| Procedural | How to run a debate round, how to audit a citation | `skills/` folder per role, progressive disclosure (name+description in context; full procedure loaded on activation) | Persistent, versioned |

**Progressive disclosure — 3 tiers, enforced everywhere:**
1. Compact index only (claim IDs, statuses, confidence, contradiction flags) — default in-context.
2. Specific claim/evidence file — loaded only when an agent is actively working it.
3. Full original source passage — loaded only when actively disputing/citing.

**Compaction policy:** when a debate thread approaches its token budget, summarize into `decisions/`, discard the raw transcript. Never let a session grow unbounded.

---

## 6. Orchestration (LangGraph)

### 6.1 State schema (Pydantic, sketch)

```python
class LabProjectState(TypedDict):
    lab_project_id: str
    mode: Literal["research", "brainstorm"]
    active_question: str
    budget: BudgetState          # calls used, rounds used, thresholds
    pending_tasks: list[Task]    # targeted delegation queue
    open_contradictions: list[str]
    checkpoint: str              # LangGraph checkpointer key, per Lab Project
```

Checkpointer: SQLite-backed (`langgraph-checkpoint-sqlite`), one file per Lab Project — keeps checkpointing embedded/filesystem-consistent with the rest of the storage philosophy. No Postgres required anywhere in v1.

### 6.2 Node graph

```
START → TRIGGER_CLASSIFIER (cheap single-pass first; escalate only if confidence/coverage threshold unmet — iMAD pattern)
  ↓
PLAN (Research Director produces research_plan.yaml, mode-aware)
  ↓
INDEPENDENT_FIRST_PASS (Scientist/Investigator/Skeptic OR Ideator run with fresh context, in parallel — never see each other's output yet)
  ↓
EVIDENCE_EXTRACTION → write evidence/*.yaml
  ↓
CONFLICT_DETECTION (Research) | NOVELTY_CHECK (Brainstorm)
  ↓
 ┌─ sufficient ──────────────┐         ┌─ insufficient ─┐
 │                           │         ▼                │
 │                     ADVERSARIAL_REVIEW ◄── TARGETED_RESEARCH/TARGETED_IDEATION
 │                           ↓
 │                     EVIDENCE_ADJUDICATION (judge model, excluded from council)
 │                           ↓
 │                     SYNTHESIS
 │                           ↓
 │                     CITATION_AUDIT (existence → pincite → support-match)
 │                           │
 │                    ┌─ PASS ┴─ FAIL ─┐
 │                    │                ▼
 │                    │         TARGETED_REPAIR → CITATION_AUDIT
 │                    ▼
 │              [HUMAN CHECKPOINT — approve/inspect]
 │                    ↓
 └──────────────► FINAL_OUTPUT (report.md, references.md, or product/ note)
```

Human checkpoints (§31): after PLAN (approve scope before spending budget), after SYNTHESIS (approve before publish). Configurable per Lab Project — can run fully autonomous for low-stakes exploration.

---

## 7. MCP Tool Layer

| Tool | Used by | Notes |
|---|---|---|
| `search_web` | Investigator, Ideator | General web |
| `search_academic` | Investigator | Papers/preprints |
| `fetch_url` / `crawl_page` | Investigator | Precision/recall fallback pair |
| `fetch_pdf` / `extract_pdf` | Investigator | |
| `grep_project` / `glob_project` | All agents | Tier 1 retrieval over the Lab Project filesystem |
| `keyword_search` (Tantivy) | All agents | Tier 2 |
| `semantic_search` (LanceDB) | Supervisor (dedup pass), cross-project queries | Tier 3, used sparingly |
| `store_source` / `retrieve_evidence` | Investigator, Scientist | Writes/reads the blackboard |
| `query_claims` (SQLite view over YAML, regenerated) | Supervisor, UI backend | Structured filter queries ("all DISPUTED, confidence < 0.5") — grep can't do this |
| `citation_verify` | Citation Auditor | 3-stage: metadata → memory lookup → web/scholarly cross-check |
| `generate_visualization` | Synthesis node | Evidence-derived only, never invented |

---

## 8. Backend API (FastAPI)

Base path `/api/v1`. This is what the control-panel UI consumes — nothing else should touch the filesystem directly except the agent runtime.

| Method | Path | Purpose |
|---|---|---|
| GET | `/lab-projects` | List all Lab Projects (id, title, mode history, last activity, open contradictions count) |
| POST | `/lab-projects` | Create new Lab Project (title, initial question, mode) |
| GET | `/lab-projects/{id}` | Full project.yaml + summary counts |
| DELETE | `/lab-projects/{id}` | Archive (never hard-delete without confirmation) |
| POST | `/lab-projects/{id}/runs` | Start a run (mode, question override, budget override) |
| GET | `/lab-projects/{id}/runs/{run_id}` | Run status |
| GET | `/lab-projects/{id}/runs/{run_id}/stream` | SSE — live node transitions, agent activity, blackboard diffs |
| POST | `/lab-projects/{id}/runs/{run_id}/approve` | Resolve a human checkpoint (approve/reject/edit-and-continue) |
| GET | `/lab-projects/{id}/claims` | Filterable (status, confidence range, contradiction flag) — backed by the SQLite query view |
| GET | `/lab-projects/{id}/claims/{claim_id}` | Full claim + linked evidence + linked sources |
| GET | `/lab-projects/{id}/ideas` | Brainstorm-mode ideas, filterable by status |
| GET | `/lab-projects/{id}/contradictions` | Open contradictions needing targeted research |
| GET | `/lab-projects/{id}/audits/latest` | Citation audit results (PASS/WARN/FAIL per claim) |
| GET | `/lab-projects/{id}/decisions` | Episodic log |
| GET | `/lab-projects/{id}/output/report` | Rendered final report (markdown) |
| GET | `/lab-projects/{id}/budget` | Calls used, cost estimate, remaining thresholds |
| POST | `/lab-projects/{id}/product-notes` | Append product-elaboration note (links a Lab Project to a downstream `/areas/` project) |

---

## 9. Control Panel UI (Next.js 15)

Consumes the API above exclusively. No direct filesystem or DB access from the frontend.

### 9.1 Pages

- **`/` — Dashboard**: Lab Project cards (title, mode, status, open contradictions badge, last activity). "New Lab Project" CTA.
- **`/lab/[id]` — Lab Project overview**: question, mode toggle, budget gauge, tabs → Claims / Ideas / Evidence Graph / Runs / Product Notes / Output.
- **`/lab/[id]/claims`**: filterable/sortable table (status, confidence, contradiction flag) — row expands to linked evidence + sources + adjudication reasoning. This is the primary trust-verification surface: click any claim, see the full trace to source.
- **`/lab/[id]/ideas`** (Brainstorm mode): kanban-style board by status (proposed → under review → promoted/rejected), each card shows novelty check + proposed experiment.
- **`/lab/[id]/graph`**: visual evidence graph (claim/source/evidence nodes, supports/contradicts edges) — read-only exploration view, not an editor.
- **`/lab/[id]/runs/[runId]`**: live run view — node-by-node progress via SSE, agent activity feed, blackboard diff stream, human-checkpoint approval modal when triggered.
- **`/lab/[id]/audit`**: citation audit results table, PASS/WARN/FAIL, drill into the specific sub-check that failed (existence/pincite/support-match).
- **`/lab/[id]/output`**: rendered final report, export buttons (md/PDF via existing docx/pdf skills), and a "promote to product" action that writes a product-note and can hand off to `labs.kcb.ma`.
- **`/settings`**: model assignment per role (OpenRouter model IDs), judge-model exclusion list, budget defaults, human-checkpoint toggles per mode.

### 9.2 Key components

- `ClaimConfidenceBar` — visual breakdown of the multidimensional confidence score (§4.2), not a single number.
- `EvidenceTraceModal` — claim → evidence → source → original location, one click, matches §12's audit-trail requirement.
- `RunActivityFeed` — SSE-driven, shows which node/agent is active, token/cost ticking, with a pause/approve control at checkpoints.
- `ContradictionBadge` — surfaced anywhere a claim has opposing sources, links directly to the targeted-research task if one exists.
- `BudgetGauge` — calls used / max_model_calls, rounds used / max_research_rounds (§28), stops the run cleanly on exhaustion rather than erroring.

### 9.3 Data flow

- Initial page load: standard REST fetch.
- Active runs: SSE subscription (`/runs/{run_id}/stream`) for live updates — no polling.
- Human checkpoints: modal blocks nothing else in the UI; other Lab Projects remain fully usable while one run waits for approval.

---

## 10. Non-Functional Requirements

- **Model assignment**: OpenRouter, per-role config in `/settings`. Judge/Adjudicator model must never equal any council-member model used in the same run (self-preference bias mitigation) — enforce this as a hard validation rule at run-start, not a convention.
- **Budget controller** (§28): `max_model_calls`, `max_research_rounds`, `max_sources`, `max_sources_per_claim` per Lab Project, overridable per run. Trigger classifier (§6.2) must run before any full-council escalation.
- **Caching**: tool-output cache is mandatory, not optional — check before every fetch.
- **Retrieval harness discipline**: iterative narrow-then-read for all Tier 1/2/3 tools; no single-shot retrieval calls.

---

## 11. Deployment

- **Backend**: FastAPI, Coolify/Hetzner, one container per environment (dev/prod). No Postgres service required for v1.
- **Frontend**: Next.js 15, same Coolify project.
- **Storage**: persistent volume mounted at `lab-projects/`, backed up via existing git/Hetzner snapshot practice — git-diffable YAML means the backup *is* meaningful version history.
- **Indices** (`.index/tantivy`, `.index/lancedb`): ephemeral, rebuildable — do not need to be in the backup path, only the source YAML does.
- **LangGraph checkpointer**: SQLite file per Lab Project, lives alongside the YAML in the same volume.

---

## 12. Build Phases

| Phase | Scope |
|---|---|
| **MVP** | Deep Research mode only. Scientist/Investigator/Skeptic + Judge + Citation Auditor. Filesystem + ripgrep only (skip Tantivy/LanceDB initially — add when grep stops being enough). Control panel: Dashboard, Lab Project overview, Claims table, Run view. No Brainstorm mode yet. |
| **Phase 2** | Brainstorm mode + Ideator/Explorer agent. Ideas board UI. Novelty-check pass. |
| **Phase 3** | Full citation audit 3-stage pipeline. Tantivy + LanceDB indices. Source-independence clustering (§20/§4.2). |
| **Phase 4** | Cross-Lab-Project semantic search. Academic/Publication-tier mode (reproducibility audit, methodology analysis). Product-note → `labs.kcb.ma` handoff automation. |

Build MVP against one real Lab Project (pick an existing `/areas/` exploration) before generalizing — validates the schema against a real topic instead of a synthetic one.
