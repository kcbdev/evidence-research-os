# Spec: Phase 6 analog-derived enhancements

## Goal

Implement every task from `DOCS/Evidence-Research-OS-Phase6-Analog-Enhancements.md`
(Tasks 46–59, cheapest-first Steps 1–7) on top of the built Phases 1–5b system:
parallel targeted research, consensus meter + search-scope toggle, coverage-check
node + Meta-Reviewer role, claim/idea dedup extension, tournament ranking +
ranked Ideas view, time-travel run debugging, and closed-corpus mode +
perspective-guided planning. Then prove the whole system coherent against
`DOCS/Evidence-Research-OS-Outcome-Contract-v1.md`, including its end-to-end
acceptance scenario.

## Scope

- In scope: Tasks 46–59 as sliced in PBI-071–077; the three extraction-doc
  rows the guide did not carry (PBI-081 audit pass-rate metric, PBI-082
  source viewer, PBI-083 structure editor); the Phase 6 cumulative
  validation table (PBI-078); the Outcome-Contract coherence run + §6 scenario
  (PBI-079); the explicitly deferred search-filtering half (PBI-080, Blocked).
- Out of scope: Methodology schema changes, graph-compiler redesign, storage
  layer reshaping (per the guide's "What this doesn't touch" — none of the
  PBIs may require them; if one does, stop per the refinement rule); the
  Firecrawl/Exa retrieval-provider swap (config change, done when fetch quality
  bottlenecks — explicitly not ordered here); auth/billing, multi-tenancy, and
  any "add tool" UI (Outcome Contract §5 non-goals — adding them violates this
  spec); sandboxing for Tier C custom nodes (still single-operator; if a second
  author appears, the contract row correctly starts failing — see Decisions).

## Contracts (success criteria)

- C1 (perf): a run with N open contradictions does not spend ~N× the
  single-contradiction wall-clock in `targeted_research`; budget charging
  (calls + rounds via PBI-007 helpers) is unchanged.
- C2 (consensus): `GET /lab-projects/{id}/claims/{claim_id}` carries a
  `consensus` object (supporting/opposing quality-tier weights +
  percent_support, null when no weight); the Claims table row and trace modal
  render the meter beside — never instead of — the confidence breakdown.
- C3 (run-start): `POST /runs` accepts validated `search_scope`
  (`open_web | academic_only | peer_reviewed_only`, default `open_web`) and
  `pinned_sources` (list of source IDs, default none); pinned runs seed the
  evidence graph from the listed sources and skip discovery; both values are
  recorded on the run. Result-filtering by scope is explicitly deferred
  (PBI-080, Blocked — no search provider exists).
- C4 (reasoning): a deliberately incomplete run surfaces at least one
  coverage-check task feeding back into `targeted_research`; a deliberately
  incoherent draft is caught by Meta-Reviewer before citation audit (loop back
  to synthesis); judge-exclusion validation also rejects Meta-Reviewer/council
  model overlap; perspective addendum ships verbatim and presence-pinned,
  with live multi-angle decomposition deferred to plan realization (D7).
- C5 (dedup): near-duplicate ideas from separate Brainstorm runs land in the
  same duplicate cluster; claims cluster the same way; both write duplicate
  reports without touching the Claim/Idea schemas.
- C6 (tournament): a tournament run on 4+ ideas yields a stable Elo ordering;
  `GET ideas` exposes `elo_score` + `?sort=elo`; the board offers Kanban and
  Ranked views with identical card content.
- C7 (time-travel): clicking any run-history entry shows the exact channel
  state at that node transition, matching what happened; read-only over data
  the checkpointer already persists — no new write path.
- C8 (coherence): the Outcome-Contract rows verify green, Phases 1–5
  done-conditions re-run green after Phase 6 lands, and the §6 end-to-end
  scenario completes with no workarounds (any workaround fails the phase it
  occurred in, regardless of checklists).
- C9 (quality metric): audit pass rate by stage/status is surfaced as the
  quality signal; vanity counts are never labeled as quality.
- C10 (source viewer): the cited passage renders highlighted in place in
  the trace modal, with an explicit plain-string fallback.
- C11 (structure editor): a recorded claim→section order is honored verbatim
  by synthesis; absence reproduces legacy behavior exactly.

## Anti-patterns

- No silent rewrites of author/operator intent (expression-honesty precedent
  from PBI-068 applies to perspective addenda and scope handling alike).
- No second save/write path: duplicate reports go through the store like every
  other object write (one write = one commit); checkpoint reads never write.
- No new JSON-viewer library for the state Sheet — reuse the CodeMirror
  dependency already pulled for the builder expression editor.
- No threshold tuning by vibes: dedup keeps the guide's 0.90 for claims/ideas
  vs 0.92 for sources, with the stated rationale (restatement vs mirroring).
- Never guess external formats (PBI-051 precedent); never invent a cost model
  for budgets (PBI-015 precedent: calls/rounds remaining is the truth).
- Webhook-assumed deploys: every prod push is verified per the coolify-ops
  skill (push → list_deployments → explicit deploy if absent → poll → HTTP).

## Decisions

- D1 (guide sketch vs as-built): Task 46 names `app/agents/{scientist,
  investigator, skeptic}.py::investigate_task` — those modules do not exist
  (council dispatch runs through `generic_node` + prompts). Concurrency lands
  in the real seam: the `make_targeted_research` factory in
  `backend/app/graph/nodes.py`, keeping per-dispatch call-count charging.
- D2 (no search provider): there is no `app/tools/search.py` / `search_web`
  (standing backlog since Phase 1) and `methodology.tools.enabled` is
  schema-only (nothing reads it at runtime). So Task 49's result-filtering and
  Task 58's tool-disabling halves have no seam: PBI-073 ships the validated
  fields + pinned seeding (real behavior); the filtering/gating halves are
  PBI-080, Blocked on the provider — mirroring the PBI-051 precedent. Accepting
  a scope value that filters nothing is disclosed in the run record, never
  silently claimed.
- D3 (RESOLVED 2026-09-14 — file supplied, row-by-row diff performed):
  all 8 functionality rows, the concurrency/checkpoint performance rows, and
  the consensus / time-travel / ranked-view / run-start-toggle UX rows map
  to Tasks 46–59 and are covered by PBI-071–077. Three rows the guide did
  not carry become PBI-081 (audit pass-rate metric), PBI-082 (highlighted
  source viewer), PBI-083 (pre-synthesis structure editor). Placement note:
  the extraction doc puts the scope Select in the methodology Tools tab
  while the guide (newer, the build input) puts it in the run-start dialog
  — the guide wins, PBI-073 follows it. The Firecrawl/Exa provider swap
  stays deferred per the guide's own performance note (config change on
  observed need, not preemptive). The three NOT-to-adopt rows were already
  non-goals, guarded by Outcome Contract §5 — no PBIs, correctly.
- D4 (contract wins on re-validation): the guide's "nothing here requires
  re-validating Phases 1-5" is superseded by Outcome Contract §1-row-8, which
  explicitly requires re-running earlier done-conditions after Phase 6 touches
  shared nodes. PBI-078 carries the regression.
- D5 (judge exclusion grows): Task 51's model-assignment note extends the
  PBI-008 hard startup check to the Meta-Reviewer model — same
  self-preference-bias reasoning, no new mechanism.
- D6 (Elo determinism): tournament shuffles with an injectable RNG seam so
  tests pin ordering without real model calls; live stability is witnessed,
  not unit-asserted.
- D7 (plan-stub divergence, flagged for human veto): guide Task 59 assumes
  a `plan`-node Scientist call that was never built (as-built plan is a
  stub). The perspective addendum ships verbatim as
  `prompts/scientist_planning_addendum.md`, loadable and test-pinned, with
  activation deferred to a plan-realization PBI. C4's "visibly multi-angle
  plan" is therefore presence-pinned, not live-witnessed, until then.

## Tooling

- Capability discovery 2026-09-14: the `skills` CLI exists after all (prior
  plans recorded it absent — corrected). No new skills or packages adopted:
  asyncio/stdlib cover concurrency, Elo is pure Python, checkpoint reads reuse
  `langgraph-checkpoint-sqlite`, UI reuses vendored shadcn primitives +
  CodeMirror. `tdd` and `fastapi` agent skills are installed globally already
  should executors want them; no install performed. Recorded here so PBIs can
  cite this paragraph instead of re-running discovery.
