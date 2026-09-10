# Evidence Research OS — Frontend UI/UX Specification v1

Single-operator control panel, desktop-first. Consumes only the FastAPI layer (spec §8) — no direct filesystem/DB access from the frontend, no exceptions.

---

## 1. Sitemap

```
/                                  Dashboard (Lab Project list)
/lab/new                          New Lab Project flow
/lab/[id]                         Overview (default tab)
/lab/[id]/claims                  Claims table
/lab/[id]/ideas                   Ideas board (brainstorm mode only)
/lab/[id]/graph                   Evidence graph explorer
/lab/[id]/runs                    Run history list
/lab/[id]/runs/[runId]            Live/past run detail
/lab/[id]/audit                   Citation audit results
/lab/[id]/decisions               Episodic decision log
/lab/[id]/output                  Final report + export + promote
/search                           Cross-project semantic search (Phase 4)
/settings/methodologies           Methodology registry (Phase 5)
/settings/methodologies/[id]      Methodology editor
/settings/models                  Per-role model assignment
/settings/budget                  Budget defaults
```

---

## 2. Global shell (present on every page)

**Left sidebar** (persistent, collapsible):
- Logo/wordmark → links to `/`
- "Dashboard" (Lab Projects)
- "Search" (cross-project) — Phase 4, hide until built
- Divider
- "Settings" → expands to Methodologies / Models / Budget

**Top bar** (contextual, changes per page):
- Breadcrumb: `Lab Projects / <project title> / <current tab>`
- Right side: active-run indicator (small pulsing dot + "1 run in progress" if any Lab Project has a live run — click jumps to it) so nothing gets forgotten in the background
- Toast/notification area: run completed, checkpoint waiting, audit failed — bottom-right, non-blocking

**Lab Project sub-nav** (tabs, only present under `/lab/[id]/*`):
`Overview | Claims | Ideas* | Graph | Runs | Audit | Decisions | Output`
(*Ideas tab only rendered if the Lab Project's mode history includes "brainstorm")

---

## 3. Dashboard (`/`)

**Purpose:** entry point, at-a-glance status across all Lab Projects.

**Layout:** grid of cards, one per Lab Project.

**Card contents:**
- Title, current mode badge (research/brainstorm/academic)
- Status: idle / running (with node name) / awaiting approval / done
- Open contradictions count (red badge if > 0)
- Last activity timestamp
- Mini budget bar (calls used / max)

**Functions:**
- Click card → `/lab/[id]`
- "New Lab Project" button (top-right) → `/lab/new`
- Sort/filter: by last activity, by mode, by "needs attention" (has open contradictions or pending approval) — default sort is needs-attention first, this is the view you'll check most often
- Archive action (per card, confirm dialog) — soft-archive, never hard-delete without a second confirm

**States:** empty state ("No Lab Projects yet" + CTA) for a fresh install; no loading skeleton needed beyond a basic spinner given single-operator scale (won't have hundreds of cards).

---

## 4. New Lab Project flow (`/lab/new`)

**Layout:** single-page form, not a wizard — this should be fast.

**Fields:**
- Title
- Initial question (textarea)
- Mode (radio: research / brainstorm / academic)
- Methodology (dropdown, defaults to the default methodology filtered by selected mode)
- Budget overrides (collapsed by default, "Advanced" toggle reveals max_model_calls/max_research_rounds — pre-filled from the methodology's `budget_defaults`)

**Functions:**
- "Create" → `POST /lab-projects`, redirect to `/lab/[id]`
- "Create and start run immediately" — secondary button, skips the extra step of visiting Overview and clicking Start Run

---

## 5. Lab Project Overview (`/lab/[id]`)

**Purpose:** the default landing tab — status + primary action.

**Layout, top to bottom:**
- Question text (editable inline — editing here doesn't retroactively change past runs, just what a new run starts from)
- Mode + methodology currently selected (with a "change" link to the run-start dialog)
- `BudgetGauge` component — calls used/max, rounds used/max
- **"Start Run" button** — primary CTA, opens the run-start dialog (§5a)
- Quick stats row: claim count by status (small colored counters: SUPPORTED/DISPUTED/etc.), open contradictions, idea count if brainstorm mode used
- Recent activity feed (last 5 decisions from the episodic log, "View all" → `/lab/[id]/decisions`)

### 5a. Run-start dialog (modal, triggered from Overview)

**Fields:**
- Question override (pre-filled with the Lab Project's question, editable per-run)
- Mode (defaults to Lab Project's current mode)
- Methodology dropdown, filtered by mode compatibility (Phase 5)
- Budget override (collapsed/advanced)

**Function:** `POST /lab-projects/{id}/runs` → redirect to `/lab/[id]/runs/[runId]` immediately, don't wait for completion.

---

## 6. Claims table (`/lab/[id]/claims`)

**Purpose:** the primary trust-verification surface — every claim, its status, and one click to its full evidence trace.

**Layout:** dense table.

| Column | Notes |
|---|---|
| Statement | truncated, full text on hover/expand |
| Status | colored badge (SUPPORTED green, DISPUTED amber, CONTRADICTED red, etc.) |
| Confidence (overall) | numeric + small bar |
| Sources | count, supporting vs opposing |
| Contradiction | flag icon if this claim has an open contradiction task |

**Functions:**
- Filter bar: status (multi-select), min confidence slider, "contradictions only" toggle — hits `GET /claims?status=...&min_confidence=...`
- Sort by any column
- Row click → expands inline or opens `EvidenceTraceModal`

### `EvidenceTraceModal`
- Header: claim statement + status + full confidence breakdown (all 4 dimensions, not just overall — spec §4.2's `Confidence` model)
- Body: list of linked Evidence units, each showing source title/link, excerpt, strength (high/medium/low)
- Footer: "Adjudicated by [judge model], on [date]" — traceability requirement from spec §12
- If citation audit has run: inline PASS/WARN/FAIL badges per evidence unit, click → jumps to `/lab/[id]/audit` filtered to this claim

**States:** empty ("No claims yet — start a run") if no runs have completed.

---

## 7. Ideas board (`/lab/[id]/ideas`) — brainstorm mode

**Purpose:** kanban view of divergent exploration.

**Layout:** 4 columns — `Proposed | Under Skeptic Review | Promoted to Claim | Rejected`

**Card contents:** idea statement (truncated), novelty badge (novel/adjacent/duplicate), proposed experiment's falsification condition (one line).

**Functions:**
- Card click → detail panel: full statement, full proposed experiment (hypothesis/falsification condition/feasibility), novelty check detail (which existing ideas it was compared against)
- Status change buttons on the detail panel (manual — promotion isn't automatic, per spec Phase 2's "manually promote" done-condition)
- "Promote to Claim" button → creates a new Claim referencing this idea, offers to start a Research-mode run on it immediately

**States:** empty ("No ideas yet — run a Brainstorm session") — CTA links back to Overview's Start Run.

---

## 8. Evidence graph explorer (`/lab/[id]/graph`)

**Purpose:** visual, read-only exploration — not an editor.

**Layout:** node-link graph. Node types: Claim (rounded rect), Source (rectangle), Evidence (small circle). Edges: supports (green), contradicts (red), references (grey).

**Functions:**
- Click node → side panel with that object's full detail (reuses the same data `EvidenceTraceModal` shows for claims)
- Filter by status (show only DISPUTED claims and their neighborhood)
- Zoom/pan, no drag-to-edit — this view is for understanding structure, not modifying it

**Note:** build this last within its phase — it's the least load-bearing view (Claims table + modal already gives full traceability); treat it as a "nice to see the shape of the graph" view, not a blocker for anything else.

---

## 9. Run history (`/lab/[id]/runs`) and Run detail (`/lab/[id]/runs/[runId]`)

### List view
Table: run ID/timestamp, mode, methodology used, status (running/awaiting-approval/done/failed), duration, cost estimate. Click → detail.

### Detail view (live or historical)
**Layout:**
- Header: methodology name, mode, started-at, current node (if live)
- `RunActivityFeed` — chronological, one entry per node transition, each showing: node name, what it did (1-line summary — e.g. "Investigator found 3 new sources"), timestamp. Live runs stream via SSE; historical runs load the full log at once.
- `BudgetGauge` — live-updating for active runs
- If paused at `human_checkpoint`: prominent approval card — shows what's about to happen next (e.g. "About to finalize output with 2 DISPUTED claims"), buttons: Approve / Reject / Edit-and-continue (edit-and-continue opens a diff-style editor on the pending synthesis draft)

**States:** for a failed run, show the error and which node it failed at, with a "retry from last checkpoint" action (LangGraph checkpointing makes this possible — don't make the user restart from scratch).

---

## 10. Citation audit (`/lab/[id]/audit`)

**Purpose:** surface *which* check failed, not just pass/fail.

**Layout:** table, one row per (claim, evidence) pair audited.

| Column | Notes |
|---|---|
| Claim | link to claims table row |
| Existence | PASS/FAIL |
| Pincite | PASS/WARNING/FAIL |
| Support match | PASS/WARNING/FAIL — the SourceCheckup failure mode |

**Functions:**
- Row expand → the `detail` string from each `AuditResult` (spec Phase 3 Task 28) — the actual reasoning, not just the label
- Filter: show only FAILs, show only WARNINGs
- "Re-run audit" button (per claim or globally) — useful after a targeted repair

---

## 11. Decisions log (`/lab/[id]/decisions`)

**Purpose:** episodic memory, human-readable — "what happened and why," per spec §5.

**Layout:** reverse-chronological list, each entry: `what` (bold), `why` (below, smaller), timestamp. No pagination needed at single-operator scale — infinite scroll or a simple "load more."

**Function:** this is read-only — it's the audit trail, not an editable log.

---

## 12. Output (`/lab/[id]/output`)

**Purpose:** the actual deliverable.

**Layout:** rendered markdown report, full width, table of contents sidebar (auto-generated from headers) since reports can be long.

**Functions:**
- Export: Markdown / PDF (via existing pdf/docx skills) — buttons top-right
- "Promote to product" button → opens the product-note form (title, note text, optional linked `/areas/` slug) → `POST /lab-projects/{id}/product-notes`
- If output/report.md doesn't exist yet (no completed run): empty state pointing back to Start Run

---

## 13. Cross-project search (`/search`) — Phase 4

**Layout:** single search bar, results below grouped by Lab Project.

**Function:** semantic query across all Lab Projects' evidence — each result shows the matching text, which Lab Project it's from, and a link into that project's Claims table filtered to the relevant claim.

**Note:** don't build this before Phase 4's LanceDB cross-project index exists — the nav item should simply not render until then, not show a "coming soon" placeholder (dead UI is worse than absent UI).

---

## 14. Settings — Methodologies (`/settings/methodologies`)

**Layout:** list (name, description, compatible modes, default badge, "Set as default" action) + "New Methodology" button.

**New/Edit view (`/settings/methodologies/[id]`):**
- v1: raw YAML editor (syntax highlighting, validate-on-save against the `Methodology` Pydantic schema, inline error messages on validation failure) — not a visual workflow builder, that's real additional scope not justified until you've authored several methodologies by hand and know what a builder would actually need to support
- Read-only preview of the compiled stage graph (simple vertical list of stages in order, loop-backs shown as an indent/arrow) so you can sanity-check the YAML produced something sane before saving

**Function:** "Set as default" — confirms, since this changes what every future run without an explicit methodology_id will do.

---

## 15. Settings — Models (`/settings/models`)

**Layout:** table, one row per role (scientist/investigator/skeptic/judge/ideator), each with an OpenRouter model-ID input.

**Function:** on save, run the same `validate_model_assignment` check the backend enforces at run-start (judge ≠ any council model) — surface the error here too, before a run ever gets a chance to fail on it.

---

## 16. Settings — Budget (`/settings/budget`)

**Layout:** simple form — `max_model_calls`, `max_research_rounds`, `max_sources`, `max_sources_per_claim` — these become the fallback defaults for new Lab Projects/methodologies that don't specify their own.

---

## 17. Component inventory (reused across views)

| Component | Used in |
|---|---|
| `ClaimConfidenceBar` | Claims table, EvidenceTraceModal |
| `EvidenceTraceModal` | Claims table, Graph explorer, Audit page |
| `RunActivityFeed` | Run detail |
| `BudgetGauge` | Overview, Run detail |
| `ContradictionBadge` | Dashboard cards, Overview quick stats, Claims table |
| `StatusBadge` (claim/idea/audit status, color-coded consistently everywhere) | Claims, Ideas, Audit |
| `ApprovalCard` | Run detail (human_checkpoint) |
| `MethodologyPicker` | Run-start dialog, New Lab Project flow |

Keep `StatusBadge`'s color mapping identical across every view (SUPPORTED=green, DISPUTED=amber, CONTRADICTED=red, etc.) — inconsistent status colors between the Claims table and the Audit page would undercut the exact trust-signal this whole UI exists to provide.

---

## 18. Key user flows (walkthrough)

**Flow A — daily check-in:** Dashboard (sorted needs-attention-first) → click a card with open contradictions → Overview → Claims table filtered to DISPUTED → EvidenceTraceModal on the worst one → decide whether to start a targeted run.

**Flow B — starting fresh research:** Dashboard → New Lab Project → fill question, pick mode+methodology → Create and start run immediately → Run detail, watch via SSE → Approve at human_checkpoint → Output tab, export or promote to product.

**Flow C — brainstorm-then-validate:** Lab Project in brainstorm mode → Ideas board → an idea survives Skeptic review → Promote to Claim → immediately offered a Research-mode run on that Lab Project (mode switches mid-project, methodology picker now filtered to research-compatible options) → normal Flow B from there.

**Flow D — authoring a new methodology (Phase 5b):** Settings/Methodologies → New → YAML editor, add a `custom_roles` entry (Tier A) or a `loop_condition` expression (Tier B) → save, validation passes → back to a Lab Project's run-start dialog, new methodology now selectable → run it, watch the Run detail feed to confirm the new stage actually executed.

---

## 19. What's explicitly out of scope for the UI (v1)

- No visual workflow builder (methodology editing is YAML, per §14)
- No multi-user permissions/roles UI — single operator
- No mobile-optimized layout — desktop-first is fine given who uses this
- No in-app billing/cost-alerting beyond the budget gauge — you're watching this yourself, not building alerting infra for the two of you
