# Spec: phase-1-mvp (Deep Research mode)

## Goal

One real research question runs end-to-end — plan → independent council
pass → extraction → conflict handling → adversarial review → adjudication
→ synthesis → basic citation audit → human approval → `report.md` — and
every claim in the output traces back to a source through the control
panel, with no manual filesystem inspection.

## Scope

- In scope (plan tasks 6–20):
  - **Orchestration:** `LabProjectState` + per-project SQLite checkpointer;
    13 nodes wired per spec §6.2 (classifier, plan, first-pass, extraction,
    conflict, targeted-research loop, adversarial review, adjudication,
    synthesis, citation-audit BASIC existence-check only, repair loop,
    human checkpoint, final output). `interrupt_before=["human_checkpoint"]`
    is the ONLY pause mechanism.
  - **Budget:** `max_model_calls` / `max_research_rounds` hard stops from
    `project.yaml`; classifier runs before full-council escalation.
  - **Agents:** Scientist / Investigator / Skeptic / Judge prompts
    (guide §3.3, files not inline strings); OpenRouter per-role config;
    `validate_model_assignment` refuses judge∩council overlap at
    graph-build time.
  - **Tools:** `search_web`, `fetch_url`, `fetch_pdf`, `extract_pdf`,
    `grep_project` (iterative narrow→read nudges), `store_source`,
    `retrieve_evidence`; `tool_outputs/<session_id>/` check-before-fetch
    cache keyed by URL/DOI hash.
  - **API** (`/api/v1`): lab-projects CRUD, runs start/status/SSE stream/
    approve, claims + claim detail (SQLite view regenerated from YAML —
    never hand-maintained), decisions, budget, output/report.
  - **UI:** dashboard, lab overview (Claims/Runs/Output tabs only),
    filterable claims table + `EvidenceTraceModal`, run view
    (`RunActivityFeed` via SSE, `BudgetGauge`, approval modal).
- Out of scope: Brainstorm mode + Ideas board (Phase 2); pincite/
  support-match audit stages, Tantivy, LanceDB, independence clustering
  (Phase 3); cross-project search, academic tier, product handoff
  (Phase 4). Ideas/Graph/Audit UI tabs wait for their phases.

## Contracts (success criteria)

- Real-question run traverses all 13 nodes in order, pauses at
  `human_checkpoint`, resumes correctly via `POST .../approve`.
- Deliberate judge==council misconfiguration refuses to start a run.
- Claims table click-through reaches the real source via
  `EvidenceTraceModal` with an accurate trace.
- Budget exhaustion stops a run cleanly, never mid-call errors.
- Re-running the same question reuses `tool_outputs/` cache (no refetch).
- MVP "done" = guide §7 checklist green (git-per-write visible,
  full node path, pause/resume, judge refusal, trace modal, budget stop,
  cache reuse).

## Anti-patterns

- Full council firing before the trigger classifier decides escalation.
- Agents seeing each other's output during `INDEPENDENT_FIRST_PASS`.
- Single-shot retrieval calls; any fetch bypassing the cache.
- Weighing consensus over evidence in adjudication (three agents agreeing
  does not make an unsupported claim true).
- Building a second pause mechanism alongside `interrupt_before`.
- Frontend touching filesystem/DB directly — `/api/v1` exclusively.

## Decisions

- Citation audit is existence-check only in MVP; 3-stage pipeline is
  Phase 3 (spec §12 build phases).
- SQLite claims view exists exactly for status+confidence filtering —
  the case grep cannot do.
- Skills: `langgraph-human-in-the-loop` (checkpoint/approve pattern),
  `langgraph-persistence` (SqliteSaver wiring).

## Tooling

- Backend gates: `python -m pytest backend/tests -q`.
- Frontend gates: `cmd /c "npm.cmd --prefix frontend run typecheck"`,
  `cmd /c "npm.cmd --prefix frontend test"`.
