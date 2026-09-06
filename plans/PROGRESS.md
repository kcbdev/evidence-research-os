# PROGRESS.md — Evidence Research OS

## 2026-09-05 — ASDLC onboarding (complete, awaiting confirmation)

- Audited repo: docs-only (`DOCS/` trio), no code, no git. Read/Grep fallback
  used (no `.codegraph/` index — suggest `codegraph init` once code lands).
- `git init`; micro-commit discipline starts now; no legacy history to preserve.
- Toolchain: Python 3.12.10, Node v22.23.2, git 2.45.1. `uv` NOT installed
  (Phase 0 PBI standardizes it); `pytest` 9.1.1 installed via pip.
- Verification baseline LIVE: `python -m pytest tests/ -q` → 3 passed.
- Wrote `AGENTS.md` (constitution + Context Map + Plane binding),
  `ARCHITECTURE.md` (as-built snapshot), `plans/README.md` (bootstrap index).
- Plane binding: `kcb` / `EVRSH` — verified via MCP. Todo seed: 0 issues.
- Next: user confirms this report → route Phase 0 to asdlc-plan.

## 2026-09-05 — asdlc-plan: Phase 0+1 (scope = guide doc, per user)

- Capability discovery: `skills find` × 3 gaps. Approved + installed
  (global, opencode): `langgraph-human-in-the-loop`,
  `langgraph-persistence`. Declined for now: nextjs-app-router-patterns,
  fastapi-official. `uv` install deferred to PBI-001.
- Plane pull (1b): EVRSH still 0 issues — nothing to pull; Specs authoritative.
- Wrote `specs/phase-0-scaffold/spec.md` (tasks 1–5) and
  `specs/phase-1-mvp/spec.md` (tasks 6–20) — AWAITING HUMAN REVIEW
  (no code may be touched before approval).
- Derived 19 atomic PBIs (`tasks/PBI-001.md` … `PBI-019.md`); sequencing +
  dependency graph + gate plan in `plans/README.md`. Push-create to Plane
  (6b) not requested — ask before syncing.
- Next: user reviews both specs, then picks the starting PBI (recommended: PBI-001).

## 2026-09-05 — PBI-001 Done (review: agentic)

- Specs approved by user; PBI-001 executed. uv 0.12.10 (pip), `uv sync`
  green incl. from clean `.venv` delete; backend scaffold tests 3 passed;
  repo smoke 3 passed; `tsc --noEmit` clean; `next build` success.
- Failed approaches (do not repeat): (1) `New-Item lab-projects` with
  backend-cwd created `backend/lab-projects` — root data dir lives at
  repo root; (2) pyproject without `version` breaks `uv sync` (PEP 621);
  (3) uncommittable `lab-projects/` (gitignored empty dir) made the
  scaffold test pass-local/fail-on-clone — fixed via
  `lab-projects/*` + `!lab-projects/.gitkeep`, probe-verified.
- Spec divergence (approved mid-flight): Next 16.3.4 scaffolded vs spec's
  Next 15 → spec/AGENTS/ARCHITECTURE updated to 16; DOCS/ untouched (read-only).
  uv via pip (not standalone installer) — recorded, functionally equivalent.
- Gates evidence: commits e9b08ff (scaffold) + 48dc8eb (review fixes);
  critic subagent verdict CHANGES-REQUESTED → fixed → re-gated green.
  Sort rationale: fully gate-proven, no UX/security/production surface,
  divergence human-approved → agentic, closed to Done.
- Chained: PBI-002 → Active (deps satisfied).

## 2026-09-05 — PBI-002 Done (review: agentic)

- `backend/app/models/evidence.py`: guide-§1.1 classes byte-faithful
  (critic-verified line-by-line) + Idea per spec §4.2; Contradiction/
  Experiment deferred with rationale (guide §2.3 tracks contradictions
  as Tasks; no Experiment schema exists yet — inventing one would
  violate "no change without a spec").
- `backend/tests/test_models.py`: 10 tests, spec-example fixtures
  (C-017 confidences, E-102 location, D-011 what/why verbatim).
- Gates: 13 passed. Critic APPROVE (da82f4d); 3 nits fixed + re-gated
  (c99eb5e); remaining nits recorded: parametrize negatives per-value,
  YAML-text vs model-== wording, Task/Meta fixtures are guide-only.
- Sort: gate-proven + critic-approved, no human judgment → agentic.
- Chained: PBI-003 → Active.

## 2026-09-05 — PBI-003 Done (review: agentic)

- `LabProjectStore`: layout + typed CRUD for 6 types + meta; zero git.
- Failed approach (do not repeat): guide §1.2 layout omits `ideas/`
  but spec §4.1 requires it and `write_idea` needs the dir — added
  with NOTE comment (spec wins over guide; critic concurred).
- Gates: 20 passed; only-writer grep confirmed (2 hits, both in store).
  Critic APPROVE; nits fixed (sorted-comment, assert style) in 5ae10b9.
- Handoff note written into PBI-004: `write_meta` bypasses `_write`
  (needs its own commit path) + no-`.git` test assertion must flip.
- Sort: gate-proven + critic-approved → agentic.
- Chained: PBI-004 → Active.

## 2026-09-05 — PBI-004 Done (review: agentic)

- `_commit` helper + `Repo.init`/reuse in `__init__`; `write_meta`
  commits `meta: {id}`; no-`.git` test assertion flipped by design.
- Failed approach (do not repeat): test needle `decision: D-1` —
  message carries `what[:60]` per guide, not the id.
- Phase-0 done-proof executed (temp script, since removed): hand-made
  project, 7 writes → 7 commits, `git log` reads as history. PASS.
- Gates: 22 passed. Critic APPROVE; PBI-text nits fixed (8→7 commits,
  test-file location, PBI-011 concurrency handoff) in 6480a6f.
- Follow-ups recorded, not done: per-commit isolation loop (test
  hardening), branch-pinning for reuse test, git-identity startup
  check (ops-side: set git config in backend image), index-race
  serialization (owned by PBI-011).
- Sort: gate-proven + critic-approved, local-only proof → agentic.
- Chained: PBI-005 → Active.

## 2026-09-05 — PBI-005 In Review (review: MANUAL — infra, human-gated)

- MCP findings: no EVRSH resources exist; toolset has no create-project/
  create-service tools (lifecycle only) → creation is Coolify-UI manual.
  Reference shape grounded on LOOM app (dockerfile build, http health
  check, FQDN). LOOM has no volumes — no local mount precedent.
- Blockers needing the human: (1) repo has NO git remote — Coolify
  deploys from git, so create `kcbdev/evidence-research-os` + push
  first; (2) server choice (kcb.ma / EXO IT / UNSI); (3) backend has no
  routes yet → use TCP/port-8000 health check until PBI-014 adds /healthz.
- Handoff package given to user (see chat): project + backend app
  (nixpacks, base /backend, port 8000, LAB_PROJECTS_ROOT + GIT_* env,
  OPENROUTER_API_KEY deferred to Phase 1) + frontend app (base
  /frontend, port 3000, NEXT_PUBLIC_API_URL after backend FQDN known)
  + persistent volume → /data/lab-projects + redeploy-survival test.
- Chain PAUSED here by design (manual sort) — PBI-006+ wait for Done.
- Human decisions (2026-09-05): server = kcb.ma server; repo =
  kcbdev/evidence-research-os. Awaiting: repo creation + push, Coolify
  project + 2 apps + volume, then project UUID + app UUIDs for MCP verify.
- NOTE: PBI-006's deps (002, 003) are Done, so code work continues in
  parallel with the human infra track; PBI-005 closes when UUIDs arrive.

## 2026-09-05 — PBI-006 Done (review: agentic)

- `state.py` + `build.py` (13 nodes, exact guide §2.2 topology) +
  `nodes.py` (classifier + plan real, 11 named stubs).
- Version adaptation (mandatory, not drift): guide's
  `SqliteSaver.from_conn_string` is a context manager on
  checkpoint-sqlite 3.x — used `SqliteSaver(conn)` + `setup()`,
  process-owned connection, documented. Stack: langgraph 1.2.11.
- Gates: 26 passed (pause `next==(human_checkpoint,)` + resume to
  `next==()` executed). Critic APPROVE; nits fixed in 0796cb3
  (typing import, checkpoints/writes table proof).
- Follow-ups recorded: sqlite FD close/dispose path + dep floor pins
  (`langgraph>=1.2`, `checkpoint-sqlite>=3.1`) at API-wiring PBI;
  rebuild-from-path durability test at PBI-013; `plan/` git-treatment
  decision at PBI-008; untested branches (non-escalate, contradiction
  loop, repair loop) are PBI-011/013 acceptance, not here.
- Sort: gate-proven + critic-approved → agentic.
- Chained: PBI-007 → Active.

## 2026-09-05 — PBI-007 Done (review: agentic, via CHANGES-REQUESTED)

- `budget.py` (is_exhausted/consume_calls/consume_round) + classifier
  hard stop (`escalate = not exhausted`); exhausted runs reach END
  with no plan file; fresh budget escalates.
- Critic CHANGES-REQUESTED was right: mid-run stops, decisions-entry,
  and max_sources/caps were unenforced/unowned. Fixed by explicit
  assignment, not code: PBI-011 owns mid-loop stop + source caps +
  no-free-calls + partial-update returns; PBI-013 owns mid-repair stop
  + terminal decisions/ entry. TYPE_CHECKING + test symmetry fixed.
- Process failure (do not repeat): committed ee20333 BEFORE gating —
  it broke collection (TYPE_CHECKING needs `from __future__ import
  annotations`). Rule: gate → commit, never commit → gate. Fixed in
  7052e3f, 30 passed.
- Sort: entry-stop gate-proven + critic findings fully addressed
  (code or owned deferral) → agentic.
- Chained: PBI-008 → Active.

## 2026-09-05 — PBI-008 Done (review: agentic, via CHANGES-REQUESTED)

- `client.py` (OpenRouter, key at call time, empty-completion
  ValueError) + `config.py` (byte-exact refusal) + 4 prompt files
  (guide wording verbatim) + build-time validation.
- Critic caught a REAL hole: optional params made the "hard check"
  fail-open (silent skip incl. partial supply). Fixed fail-closed:
  required params; all 6 skeleton call sites updated; bare call now
  TypeErrors by test. Also fixed: client assert→ValueError, key
  RuntimeError, PBI filename drift, PBI-014 plan/ ADR acceptance.
- Gates: 35 passed. Sort: critic-approved after fix → agentic.
- Chained: PBI-009 → Active.

## 2026-09-05 — PBI-009 Done (review: agentic, via CHANGES-REQUESTED)

- Tools: `grep_project` (rg wrapper + contract docstring), `fetch_url`/
  `fetch_pdf`/`extract_pdf`, `store_source`/`retrieve_evidence`. rg
  15.2.0 installed via winget (hard gate prerequisite, portable paths
  documented: winget/apt/image).
- Critic caught 3 real gaps: missing `extract_pdf`, silent HTTP
  failure (404 read as ""), skippable rg gate. All fixed: fail-loud
  fetch (`raise_for_status` + 404 tests), fail-loud grep (no skip,
  exit-2 → RuntimeError, timeout=60), `extract_pdf(bytes|path)`.
  docstring tripwire debugged (contract lived on module, not fn).
- Nits folded in: fetch_pdf redirects, server_close, contract-phrase
  assertions, PBI-010 same-name-wrap acceptance.
- Open backlog (needs plan delta, NOT this chain): `search_web`
  provider undecided (spec names it, guide omits it).
- Gates: 43 passed. Sort: critic-approved after fix → agentic.
- Chained: PBI-010 → Active.

## 2026-09-05 — PBI-010 Done (review: agentic, via CHANGES-REQUESTED)

- Critic's 5 must-fix were all real: (1) ban is now a TEST
  (`test_no_raw_fetch_imports_in_graph_or_agents` — prose became
  mechanism); (2) session-vs-norefetch resolved as two-tier lookup
  (session first, global second, provenance copy) — both spec
  statements literally true, interpretation documented; isolation
  test rewritten as cross-session REUSE; (3) kind-aware keys
  (html/pdf split, tested); (4) session_id ownership assigned
  (PBI-014 mints as run_id, PBI-011 threads via state field);
  (5) "every fetch path routes" now structurally guarded.
- Also fixed: wrapper delegation tests, AGENTS backend gate row
  (`uv run ...`, workdir backend — bare python lacks deps).
- Gates: 50 passed. Sort: critic-approved after fix → agentic.
- Chained: PBI-011 → Active (deps 006, 008, 010 Done).

## 2026-09-05 — PBI-011 Done (review: agentic, via CHANGES-REQUESTED)

- Council loop real: concurrent isolated first pass (to_thread+gather),
  FINDING_FORMAT protocol extraction, Jaccard challenge matching,
  targeted dispatch with debates transcripts, exhaustion edge to
  final_output, loop termination executed (not argued).
- Critic's 5 must-fix, all addressed in code (9ea95bd): (1) budget via
  helpers on copies incl. per-dispatch call counts — dead import gone;
  (2) max_sources GLOBAL (preloaded registry, per-role suffixes) +
  test incl. pre-existing; (3) task upsert-on-changed-reason +
  prune-resolved via new delete_task (git-rm, not cached-remove —
  caught by test); (4) session/cached_* honestly deferred to runtime
  backlog in PBI text, ban test guards; (5) parse returns skipped
  counts, asserted.
- Own bugs caught by gates (do not repeat): council_models/models
  rename slip; sorted-list expectations (investigator < scientist);
  debates/ exists from layout (assert files, not dir); paren slip in
  test edit; `index.remove` defaults to --cached.
- Open backlog (plan delta needed, NOT this chain): runtime MCP
  exposure for cached_*/search_web (provider undecided) + session_id
  readers + parse-health observability; langgraph msgpack allowlist
  for future strict mode; budgets >>25 vs recursion_limit(25).
- Gates: 63 passed. Sort: critic-approved after fix → agentic.
- Chained: PBI-012 → Active.

## 2026-09-05 — PBI-012 Done (review: agentic, via CHANGES-REQUESTED)

- Skeptic transcript (claims never touched) fed to judge as context;
  no-evidence deterministic guard (`rule:no-evidence`) beats consensus;
  STATUS-protocol judge transport (fail-safe untouched); deterministic
  synthesis render; validate re-asserted at entry.
- Critic's 2 must-fix, both in code: budget per CALL made (garbage
  output still costs — new test pins it); synthesis segregates
  pending (`adjudicated_by None` never cited as adjudicated).
- Nits taken: SKEPTIC NOTES assertion, header truth, PBI filename.
  Deferred (logged): unparseable-line logging (no logging infra —
  same runtime backlog), evidence pointers in report (later).
- Gates: 70 passed. Sort: critic-approved after fix → agentic.
- Chained: PBI-013 → Active (deps 012 Done).

## 2026-09-05 — PBI-013 Done (review: agentic, via CHANGES-REQUESTED)

- Existence-only audit + void-linkage repair (statuses untouched) +
  flag-only checkpoint (single pause mechanism intact) + terminal
  outputs (references.md, decisions/ completed|budget_exhausted).
- Critic's 2 must-fix in code: repaired-path resume proven
  (pause→approve→END + outputs + completed record); session_id
  fail-closed (no adhoc fallback; old helpers seeded).
- Nits taken: PBI file list, HITL skill citation, edge-comment
  honesty (predicate can't flip mid-repair — repair terminates by
  determinism). Deferred: sqlite close path, sourceless-SUPPORTED
  follow-up note, unparseable logging (runtime backlog).
- Process note (do not repeat): parallel commit+edits once mixed
  close-out into a fix commit — commit FIRST, then status edits.
- Gates: 79 passed. Sort: critic-approved after fix → agentic.
- Chained: PBI-014 → Active (deps 013 Done).

## 2026-09-05 — PBI-014 Done (review: agentic, via CHANGES-REQUESTED)

- Routers live: project CRUD (fail-closed auto-model defaults),
  run start/status/SSE/approve with background-thread registry,
  session==run==thread threading, per-run validation + per-project
  graph cache, approve/reject decisions recorded, ADR-0001.
- Debug history (do not repeat): path-doubling (store.path vs root —
  pinned by comment), "rejectd" grammar, SSE space-strip assertion.
  Full-suite wall time now ~50s (threaded API tests dominate).
- Critic's 7 must-fix, all in: typed human_checkpoint SSE event
  (no-polling honored) + handler docstrings; approve guards pinned
  (running→400 via slow mock, wrong-project→404); session-threading
  reworded dormant; AGENTS §4 cites ADR-0001; DELETE→PBI-020 card;
  ADR gaps closed (creation-commit clarity, output interim rule).
- Nits taken: budget-override scope comment, cache docstring truth,
  why=note assert, get_graph revalidation unit. Left open: msgpack
  allowlist, close/dispose path, budgets>>25 vs recursion limit,
  runtime MCP + search_web provider (plan delta).
- Gates: 88 passed. Sort: critic-approved after fix → agentic.
- Chained: PBI-015 → Active (deps 003, 014 Done).

## 2026-09-05 — PBI-015 Done (review: agentic, via CHANGES-REQUESTED)

- Read-model routers: claims view (DELETE+reinsert regenerate),
  trace detail, decisions, honest budget (no cost model), report
  passthrough. main.py sequenced after runs router.
- Critic's must-fix: `max_confidence` added (the card's own
  DISPUTED+<0.5 example now tested) + GET-with-write side effect
  fixed (existence pre-check; pinned by no-mkdir test).
- Left open (logged): concurrent-rebuild note, migration wart,
  dangling-link tombstones (citation PBI), N+1 irrelevant at MVP.
- Gates: 93 passed. Suite wall time ~57s (threaded API tests).
- Sort: critic-approved after fix → agentic.
- Chained: PBI-016 → Active (deps 001, 014 Done). NOTE: first
  frontend PBI — frontend/AGENTS.md authority applies.

## 2026-09-06 — PBI-016 Done (review: agentic, APPROVE clean)

- Read versioned guides first (vitest setup, client-fetching):
  toolchain matches exactly (vitest set + jsdom + globals delta for
  RTL cleanup); `test: vitest run` (watch would hang gates);
  @types/node 20→22 (scaffold conflict, types-only).
- Dashboard (list + create→re-fetch) + overview (question, budget
  gauge, claims/runs/output tabs) + api.ts (addEventListener SSE,
  cleanup) + 6 vitest tests. addEventListener is CORRECT vs the
  guide's onmessage (backend emits named events).
- Debug history: `"""docstring"""` in TS; label-query doubles →
  globals:true was the real fix (cross-test DOM leak).
- Gates: tsc clean, 6/6 vitest, next build (routes / + /lab/[id]).
- Critic APPROVE, no must-fix. Open: /claims dead link resolves in
  PBI-017; create-flow test + getReport catch-all later.
- Sort: gate-proven + critic-approved → agentic.
- Chained: PBI-017 → Active (deps 015, 016 Done).

## 2026-09-06 — PBI-017 Done (review: agentic, via CHANGES-REQUESTED)

- Claims table (filter→refetch, sortable, badge) + trace modal
  (claim→evidence→source→location, empty-evidence copy accurate to
  the no-evidence guard) + 5-dim bars + span-badge (href honestly
  deferred — no task surface exists).
- Critic's 2 must-fix in code: keyboard-reachable rows (ID buttons);
  field-level trace asserts (9 within-dialog expects incl. tier,
  adjudicator, location).
- Test-debug history: split JSX text nodes (single-expression fix);
  toBe vs toEqual with asymmetric matchers; modal/row text
  ambiguity → within(dialog) scoping.
- PBI-021 filed for the badge href (needs tasks read surface).
- Gates: tsc clean, 16/16 vitest, build (3 routes).
- Sort: critic-approved after fix → agentic.
- Chained: PBI-018 → Active (deps 014, 016 Done).

## 2026-09-06 — PBI-018 Done (review: agentic, via CHANGES-REQUESTED)

- Run view: SSE feed (addEventListener, reset-on-open dedupe),
  BudgetGauge (honest snapshot), ApprovalModal (approve/reject+note),
  resting-mount (no pointless subs), stale-checkpoint guard,
  run_done terminal event (backend, justified vs no-polling).
- Critic caught a REAL loop bug (replayed checkpoint reopening the
  modal after approve) — fixed via resolvedRef + run_done-closes +
  resting-mount short-circuit, all tested.
- Own бюджета: mangled an edit into a handler deletion (rewrote file
  cleanly after Read); TS property-narrowing in closures (const copy).
- Gates: tsc clean, 22/22 vitest, build (4 routes); backend API
  suite green with run_done pin.
- Sort: critic-approved after fix → agentic.

## 2026-09-06 — PBI-019 In Review (review: MANUAL — MVP release decision)

Validation dossier (guide §7 checklist → executed evidence):

- [x] Git-per-write visible — PBI-004 proof script (7 writes → 7
  commits) + store tests; every backend run since commits cleanly.
- [x] Full 13-node path — executed (escalation, contradiction loop,
  repair loop, checkpoint, output) across graph/API tests.
- [x] Pause/resume — executed at graph level AND over HTTP
  (start→pause→approve→done with decisions + outputs asserted).
- [x] Judge refusal — deliberate overlap test refuses pre-node.
- [x] Trace modal — 9 field-level asserts against fixture payload.
- [x] Budget stop — calls AND rounds exhaustion end runs cleanly.
- [x] Cache reuse — counter, preseed, cross-session tests.
- [ ] REAL question, REAL models, HUMAN witness — OPEN (see below).

Gates right now: repo smoke 3 ✓, backend 93 ✓, tsc ✓,
frontend 22 ✓, next build ✓ (all executed 2026-09-06).

Blockers for the open box:
1. No OPENROUTER_API_KEY in this environment — live-model runs
   (and any real fetch) cannot execute here.
2. No /areas/ topic available — the "real question" needs picking
   (suggest: a small, verifiable question with known-good sources).
3. PBI-005 infra (kcb.ma server) still awaiting human creation —
   independent of local validation, required before any shared run.

Residual risks the real run must retire: (a) live LLMs may not emit
FINDING_FORMAT/STATUS protocols (mock-only coverage; parser skips +
counts, but a 100%-malformed pass yields an empty run); (b) search_web
provider undecided (Investigator has grep/fetch/blackboard only);
(c) budgets >>25 vs langgraph recursion_limit default 25.

Sort: manual by design — stays In Review until a human witnesses a
real run and signs the MVP release. Chain STOPS here (PBI-020/021
are Phase-1 backlog, executable after release).