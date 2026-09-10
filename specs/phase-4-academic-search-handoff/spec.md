# Spec: phase-4-academic-search-handoff

## Goal

The system grows outward without disturbing the core: semantic search
across projects, a publication-grade academic tier, the product-handoff
path, the missing control-panel pages (new-lab flow, run-start dialog,
runs history, decisions, output), the approval-edit action, and the
cross-project search UI. After this phase every route in the UX spec
except methodology settings exists and works.

## Scope

- In scope: shared LanceDB index (`project_id`-filtered) + `GET /search`
  + search page (nav item appears only now — no dead UI before); academic
  mode (`methodology_analysis` + `reproducibility_audit` segment between
  adjudication and synthesis, third `mode` literal value); product notes
  API + output page (report render, export, promote-to-product) +
  decisions page; `/lab/new` + run-start dialog + runs history list page;
  approval `edit` (edit-and-continue on the pending synthesis draft);
  labs.kcb.ma export mapping (function + docs; the push itself is human).
- Out of scope: methodology registry (Phase 5 — academic/brainstorm
  pipelines are still hardcoded branches here); Keystatic publishing
  pipeline (mapping only); mobile layout; multi-user anything.

## Contracts (success criteria)

- A semantic query returns a relevant result from a different project
  than the current one (the Phase-4 search probe, seeded fixtures).
- Academic runs execute the two extra nodes in order and cost more calls
  than the same question in research mode (tier is real, not a label);
  research/brainstorm behavior unchanged.
- Output page renders `report.md` (404-empty-state before first
  completion), exports markdown, and promotes a note that round-trips
  through the product-notes API.
- One project's output reaches labs.kcb.ma shape without manual
  reformatting (mapping function + human-confirmed push).
- Approval edit resumes the paused run with the edited draft taking
  effect downstream (witnessed, not mocked).
- Every UX-spec route except `/settings/methodologies*` resolves; the
  search nav item exists only from this phase on.

## Anti-patterns

- No folding academic nodes into the default research graph (expensive
  segment, gated by mode — the guide's explicit cost warning stands).
- No per-project Tantivy merge for cross-project keyword search
  (unstated need — do not build speculatively).
- No "coming soon" placeholders for search before the index exists.
- No silent resumption anywhere (retry/edit are explicit human actions
  on named runs).

## Decisions (global coherence rulings — apply to all remaining phases)

- **Frozen as-built contracts (DOCS deviations, deliberate):** SSE event
  names (`node`/`human_checkpoint`), unprefixed UUID-style IDs (no
  `S-004` migration — would orphan all shipped history), claims-detail
  envelope shape, and the 60s stream cap stay exactly as shipped. The
  DOCS API Reference describes intent; where it conflicts with shipped
  behavior without user value, shipped behavior wins and is recorded
  here, never silently.
- **`output/report` envelope** aligns to `{markdown, generated_at}`
  (mtime-derived) since no client depends on the old `{report}` key yet —
  the one safe alignment in this phase.
- **`DELETE` archive semantics** stay PBI-020's (no `?confirm=true`
  retrofit — the UI confirm dialog already serves the purpose).
- **Status color mapping** (`StatusBadge`) stays identical across the new
  pages (claims, audit, ideas, graph) — the trust-signal rule from the UX
  spec §17 binds all new UI.
- **Methodology-shaped fields** (`methodology_id` on create/run-start,
  methodology picker UI) are Phase 5's — this phase's run-start dialog
  ships with mode/question/budget only, with the picker slot reserved,
  so Phase 5 touches these files exactly once more.

## Tooling (optional)

- Same deterministic gates. The labs.kcb.ma step needs no new tooling
  (read the `kcb-labs` Keystatic spec first — it is the format authority).
