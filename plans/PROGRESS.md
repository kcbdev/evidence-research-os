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

## 2026-09-06 — Plane sync backfill (on user flag)

- Gap owned: 21 PBIs executed with zero Plane issues (6b never
  requested). Fixed: push-created EVRSH-1..21 with TRUE statuses
  (17 Done, 2 In Progress, 2 Backlog — not all-Todo), each card's
  Context now carries `Plane: kcb/EVRSH-N`.
- Process note: parallel creation interleaves sequence_ids (PBI-002
  is EVRSH-3, PBI-005 is EVRSH-2, etc.) — the map in plans/README.md
  is authoritative, not numeric order. One self-caught mislink
  (013/014 both tagged 12) fixed before commit.
- Open: PBI-005 + PBI-019 closeouts must transition EVRSH-2/EVRSH-21
  when the human work lands; PBI-020/021 sit in Backlog until moved
  to Todo per doctrine.

## 2026-09-06 — PBI-019 live-fire log

- Run 1 (d8c15d8, budget 15): 21 claims / 20 evidence / 20 sources
  from live models (protocol WORKS), then FAILED at adjudication:
  `'utf-8' codec can't decode byte 0x92` — debates transcript written
  cp1252, read as UTF-8. Fixed: encoding="utf-8" pinned on all 11
  text-IO sites + regression test + convention guard
  (test_conventions.py). REAL bug only live data could catch.
- Run 2 (5be9cc12, budget 15): full 10-node path, calls exhausted
  mid-adjudication → clean budget_exhausted end + terminal decision.
  Human checkpoint correctly SKIPPED on exhaustion (contract, not bug).
- Run 3 (8a8d5a9, budget 40): reached awaiting_approval (11 events).
- Witness catch #2: NO CORS middleware — browser blocked :3000→:8000.
  Fixed (CORSMiddleware, localhost origins + FRONTEND_URL override,
  tested incl. preflight) in 963b16b; backend restarted (PID 31404),
  ACAO verified. Casualty: restart wiped the in-memory run registry,
  so run 3's pause record is gone (checkpoint row orphaned in sqlite
  — the documented restart-loss limitation, now observed live).
  Witness path: completed run 2 (claims/trace) + fresh UI-started run
  for the live pause.

## 2026-09-06 — PBI-019 witness run COMPLETED (awaiting sign-off)

- Run 2010620c10cc (budget 40/3, user-started from UI): full 10-node
  path → pause (11 events) → USER APPROVED in browser → resumed →
  `done` (14 events). D-approve + D-terminal:completed recorded.
  23 claims live, 190 commits in lab-project history. Total key
  spend across ALL live runs: $0.12 / $2.
- Sample: C-scientist-001 INSUFFICIENT_EVIDENCE with 1 evidence +
  1 source — specific, traceable, honestly graded.
- Incidents this session (all resolved, all recorded): UTF-8 crash,
  CORS block, transient empty completion (PBI-022 filed), silent
  wedge d156 (cause undetermined — restart + logs in place),
  shell-host death + double-backend mystery (uv shim re-exec
  understood), orphan-run adoption via checkpoint forensics.
- Open backlog from live-fire: PBI-022 (retry); checkpoint.sqlite
  lives at LAB ROOT not per-project (docs say per-project — cosmetic
  drift, behaviorally sound via thread isolation); msgpack strict-mode
  allowlist; recursion_limit vs big budgets; search_web provider.
- PBI-019 closes ONLY on explicit human sign-off of the witnessed
  UI (feed/modal/trace/approve), not on these server-side facts.

## 2026-09-07 — PBI-023 Done (review: agentic, APPROVE + nits folded)

- Judge protocol extended (same call, zero new spend): confidence
  segment parsed/clamped/fail-granular; trap stays unscored; finite
  guard added on critic nit. Kills the all-zero witness finding for
  all FUTURE runs (historical claims keep 0 — honest, they were never
  scored). Gates green. Plane: EVRSH-22 Done.

## 2026-09-07 — PBI-024 Done (review: agentic, via CHANGES-REQUESTED)

- GET runs list (newest-first, 404-safe, memory-limits documented) +
  overview history tab (links, approval flags, restart-honest empty
  state). Review fixes: lock-scoped snapshot, mkdir assert, POST
  assert, runs-error surfacing. Gates green. Plane: EVRSH-23 Done.

## 2026-09-07 — PBI-025 Done (review: agentic, via CHANGES-REQUESTED)

- Uniform max-w-4xl, tablist+counts, claims empty-filter (table
  hidden when empty), dependency-free Markdown renderer (XSS-safe by
  construction). Review fixes: empty-filter test, bare-header
  removal. Gates: tsc, 29 vitest, build. Plane: EVRSH-24 Done.

## 2026-09-07 — PBI-022 Done (review: self-verified, no subagent round-trip)

- `call_model_resilient` (bounded retry, linear backoff, APIError +
  emptiness retried, foreign errors immediate, attempts returned);
  all 4 node sites charge attempts via PBI-007 helpers; all 6 test
  fakes migrated to the tuple boundary; 4 new resilient unit tests.
- Gates: 104 backend (incl. new tests) + frontend untouched.
  No critic round-trip (narrow, fully gate-covered change; design was
  pre-approved in the PBI card). Sort: agentic.
- Plane: EVRSH-25 → Done.

## 2026-09-07 — Gate hardening, continued (segfault flake open)
- Score: ~3 crashes in 8 full runs, wandering sites (19%, 72%),
  halves ALWAYS green alone, full suite green 5/8. No test ever
  FAILS — the process dies natively (0xC0000005).
- `_commit` subprocess removal did NOT stop it (crashed after).
  Only hard artifact remains the `Popen.__del__ WinError 6` warning.
  Prime suspect unchanged: native handle/GC race under full-suite
  load on Windows (git + sqlite + threads + anyio portals).
- Standing rule: full suite green required for backend close-outs;
  on segfault, rerun once (flake) — two consecutive crashes with a
  FIXED site becomes a must-investigate. Split halves stay the
  documented fallback. NOT a product-code defect per all evidence.

- UI-started run f862d63a FAILED in first_pass: `empty completion
  from deepseek/deepseek-v4-flash-0731` (PBI-008 fail-fast working as
  designed). Direct probe 60s later: model healthy (content + stop).
  Verdict: TRANSIENT provider hiccup, no code defect — but one empty
  response killing a 10-min run is unacceptable recovery posture.
  Filed PBI-022 (bounded retry, retries counted as calls) as Phase-1
  backlog; NOT implemented mid-validation (code frozen under witness).
- Restarted run d156072c (budget 40/3) for the pause witness.
- Residual risk retired: the failed-status machinery itself proven
  (run → failed + error surfaced, no stuck "running").

## 2026-09-08 - PBI-026 Done (review: agentic, via CHANGES-REQUESTED)
- Modal now shows claims-by-status dossier + evidence/sources totals + claims-table link (new tab) + publish/reject semantics. Review fixes: totals wired from project detail, numeric/target/rel pins, failure-path test, dark nits. Gates: tsc, 34 vitest, build. Plane: EVRSH-27 Done.

## 2026-09-08 - PBI-027 Done (review: agentic, via CHANGES-REQUESTED)
- Both modals (+bars/badge) carry dark: variants; light mode untouched (additive only). Grep confirms no third overlay. Class-presence tests (right for jsdom). Human eyeball in dark mode still owed at re-witness. Plane: EVRSH-26 Done.

## 2026-09-08 - Plane discipline constitutionalized
- User directive: always synced. AGENTS.md section 4 now carries the rule (link every PBI, issues at creation, transitions propagate, reconcile on drift). Backlog review: EVRSH-18 (020) + EVRSH-20 (021) NOT due (post-release backlog, correct). EVRSH-25 (022) transitioned to Done. Project now 25 issues: 23 Done, 2 In Progress (005 infra, 019 release).

## 2026-09-08 - PBI-019 re-witness run COMPLETED (awaiting sign-off)
- Run 18a35c7b (budget 40/3, retry+confidence code): full path, pause (11 events), USER APPROVED in browser, resumed, done (14 events). D-approve + D-terminal:completed recorded.
- PBI-023 proven live: 16 of 26 claims carry judge-graded confidence above 0 (old runs zeros correctly remain unscored). Report 7721 chars rendered. No empty-completion failure, no wedge, no CORS issue this run.
- PBI-019 closes ONLY on explicit human sign-off of the witnessed UI (dossier modal, confidence bars, history tab, dark, report).

## 2026-09-08 - MVP RELEASED (PBI-019 Done, EVRSH-21 Done)
- Human signed off after re-witness. Project: 27 issues, 24 Done, 1 In Progress (PBI-005 infra), 2 Backlog (020, 021). Total live spend: .12. Remaining tracks: PBI-005 deploy, Phase-1 backlog (020, 021), open backlog (search_web provider, msgpack allowlist, recursion limits, checkpoint file placement, run persistence), proposed UI/UX shadcn pass.

## 2026-09-08 - Witness follow-up: fail-closed confusion + error swallowing
- User's new UI-created project refused runs (400): fail-closed auto/auto models working as designed, but api.ts DISCARDED the server reason (bare status). Fixed: error bodies surface in all api.ts throws + test pins reason text. No critic round-trip (4-line witness fix, gate-covered; same precedent as CORS/UTF-8 fixes under PBI-019).
- Unblocked the project via store.write_meta model config (committed). Proper fix filed as PBI-028 (settings UI + PATCH endpoint, EVRSH-28 Backlog). Console font-preload + DevTools + HMR lines: dev-only noise, not issues. Report 404 pre-synthesis: by design (empty state).

## 2026-09-08 - PBI-028 Done (review: agentic, APPROVE + nits folded)
- Required model fields in create form (blocked-empty, posts assignment); Settings tab (prefill, save, local save-error, Saved. indicator); PATCH endpoint (merge, overlap 400, blank refusal, 404-safe); api.ts error bodies surfaced everywhere. Critic APPROVE; took blank-refusal + mkdir-pin + full-payload asserts. Gates: backend file green, tsc, 36 vitest, build. Plane: EVRSH-28 Done. Restart of backend required for the endpoint to go live (done below).

## 2026-09-08 - Witness follow-up: junk dots claim + vanished run
- Live model wrote CLAIM: ... and the table showed literal dots. Fix: _has_substance floor (10 chars + 2 alnum words) in extraction, critic-approved, toy fixtures honestly lengthened. Junk row + 2 orphan evidence files ops-removed from slm history (git rm + commit).
- Vanished run explained: my PBI-028 backend restart killed the in-flight run (registry is memory-only). No new checkpoint thread existed, so nothing was lost mid-flight that the API ever served. Structural fix filed as PBI-029 (persist runs, EVRSH-29 Backlog, not due). Restart discipline added: check live runs before bouncing the server.

## 2026-09-08 - PBI-032 Done (review: agentic, via CHANGES-REQUESTED)
- Claims + trace on shadcn (Table/Dialog/Progress/Badge/Field/Alert/Empty/Skeleton). Review fixes: token discipline (no dark: overrides on shadcn wrappers), accessible-name lock, no-op (unused import), badge copy restore. Base-ui probes proved: pointer-sequence for Select options, labelledby-wins naming, portal sibling structure, async mount. Gates: tsc, 37 vitest, build. Plane: EVRSH-32 Done.

## 2026-09-08 - PBI-033 responsive evidence (Playwright, live dev server)
- 375px, overflowX=false: dashboard, overview, claims (26 rows, table scrolls internally), run view. 768px: run view clean + trace dialog opens (title correct, no overflow). 1024/1440: reasoned, not measured (max-w-4xl containers center; same code path as 768). Modal-open at 375 not directly measured (dialog max-width is viewport-relative by construction) - noted gap.

## 2026-09-08 - PBI-033 In Review (manual - needs human eyeball)
- Run view + feed + gauge + modal on shadcn; logic byte-identical (critic-verified). Review fixes: dead X removed, 44px targets, main landmark, token modal. Responsive: 375 all routes + 768 run/modal measured clean; 1024/1440 reasoned. Gates: tsc, 37 vitest, build. Critic: CHANGES-REQUESTED addressed; sort MANUAL per critic (design authority = user). Plane: EVRSH-32 In Progress. NOTE: local In Review maps to Plane In Progress (no such Plane state).

## 2026-09-08 - PBI-033 Done + UX TRACK COMPLETE (eyeball approved)
- User approved the restyled UI. EVRSH-32 Done. Track EVRSH-30..33 all Done. Project: 33 issues, 29 Done, 1 In Progress (PBI-005 infra), 3 Backlog (020, 021, 029). Control panel now: shadcn v4, dark-first OLED, AppShell nav, responsive measured, checklist signed.

## 2026-09-12 - PBI-063 Active (builder libraries API, EVRSH-63 In Progress)
- New: models/libraries.py (Skill/Prompt+history/LibraryRole/ToolInfo/ConditionField), store/libraries.py (generic YAML-per-id LibraryStore), api/libraries.py (skills/prompts/roles CRUD, prompt POST-or-version + PUT-always-versions + /versions, role tool-gate 422, read-only /tools, condition-fields, /methodologies/{id}/validate via shared _check_names), mount in main.py, tests/test_libraries.py (6 tests), backend/libraries/{skills,prompts,roles}/.gitkeep.
- Failed approaches (do not repeat): (1) create_prompt returned {"status": 201} in a 200 body — fixed via Response.status_code; (2) test asserted PUT /tools/x == 405, real is 404 (no route at all) — fixed expectation + DELETE probe; (3) REAL BUG: methodologies GET /{id} shadowed GET /methodologies/condition-fields (first-match-wins) — fixed by mounting libraries router BEFORE methodologies router in main.py. Any future exact-path route under /methodologies/* must live-or-mount before the {id} catch.
- ToolInfo.source = "backend-local" (honest: dispatch adapters, not MCP servers — spec input said "source MCP server", no such layer exists; documented in model + endpoint docstrings, not silently relabeled).

## 2026-09-12 - PBI-063 Done (review: agentic)
- Gates: 6 new tests green; full halves 217 + 25 green (first full-half run hit the known intermittent Windows sqlite/git-GC segfault in an unrelated teardown — clean on documented re-run); critic CHANGES-REQUESTED → 3 must-fixes (validate ValidationError→422 wrap; overlap validate-parity proof; PUT /prompts/ghost 404 pin) + 3 nits (condition-fields docstring, PromptVersion-constructed /versions tail, PATCH probe) applied, 10/10 regressed. Commits 5bbc627 + 8f40e60.
- Sort rationale: backend-only API, correctness gate-proven (contracts asserted per-endpoint incl. 422/404/405/409 codes), no UX/security/production surface, tmp-store tests never touch shipped YAMLs → agentic, closed to Done. EVRSH-63 Done with evidence comment.
- Critic nits disposition (not fixed, rationale): empty-YAML 500 mirrors MethodologyStore precedent (fixing both stores = scope creep); role skills refs ungated deliberately (order-free authoring must allow referencing a not-yet-created skill; PBI-065 combobox constrains the UI side); PUT /prompts beyond Directive letter is spec-justified ("every save creates a version"); import-time mkdir matches methodologies_api.store precedent.
- Process lesson (do not repeat): `git add -A` swept planning artifacts + a pre-existing PBI-062.md edit into the PBI-063 commit — stage only intended files (fixed for the follow-up commit 8f40e60, 2 files).
- Chained: PBI-064 → Active (parallel-safe with 063, deps approved).

## 2026-09-12 - PBI-064 Done (review: agentic)
- Tooling-only: 9 direct deps + 2 transitive (next-themes, react-resizable-panels), 0 vulnerabilities; 12 shadcn pulls + input-group (command's transitive dep); 3 skips identical (button/input/dialog). `form` unresolvable in shadcn CLI 4.21.0 (bare and @shadcn/ namespaced adds resolve to nothing) → substituted vendored `field` successor, Spec annotated (Decisions + Tooling deferral note for lang-javascript).
- Gates: typecheck clean, 84/84 tests, build green with identical 16 routes — zero behavioral diff proven. Critic APPROVE, nits only (applied: spec lang-javascript deferral annotation).
- Sort rationale: no code beyond vendored primitives + manifest, gates green, no human judgment → agentic, closed to Done. EVRSH-69 Done with evidence comment. Commit 37d3ae3 (scoped, 16 files — the add -A lesson from 063 applied).
- Carry-forwards (for future-PBI executors, not fixed here): `@hookform/resolvers` NOT adopted — PBI-065 hand-rolls safeParse+setError mapping (submit-time validation needs no new dep); PBI-068 to decide `@codemirror/lang-javascript`; PBI-069 card says Budget tab is a "plain Form" — read as HTML form + Field, not the removed wrapper; PBI-070 must mount `<Toaster/>` (layout untouched by design — wiring it now would have violated no-route-edits) or ValidationToastList is inert; TooltipProvider needs no global wrap (per-instance works).

## 2026-09-12 - PBI-065 Done (review: agentic)
- Built: /settings/skills + /prompts + /roles + /tools (4 pages + 15 tests), api.ts library section (+ MethodologyDetail.custom_roles widening for role badges, documented in code).
- Critic CHANGES-REQUESTED → all must-fixes applied: Edit-button Tooltips, 9-field schema mirror, dup-id guard, promote link-don't-clobber + half-state disclosure, provenance-divergence clearing, label rewiring (3 selects + model orphan), 44px Why?, id-keyed badges, N+1 warning, identity-guarded init (roles + prompts — the latter caught by a failing test, not the critic), exact-URL/edit-path/ordering/revert-refresh assertions, honest MDEditor mock. Nits applied: Omit create type, min-h consistency. Deliberately not built: multi-Combobox (card-amended to checkbox grid with rationale); role skills ungated (order-free authoring, PBI-063 decision stands).
- Gates: typecheck clean, 99/99 vitest (21 settings), build green with 20 routes (4 new, static — mount guard proven under prerender).
- Sort rationale: gate-proven contracts per page, critic clean after fixes, internal admin pages following established app patterns (057/062 precedent), no product/security/production judgment → agentic, closed to Done. EVRSH-70 Done with evidence comment.
- PBI-066 unblocked (libraries + deps live); carries its own PBI-067-owned ModelCombobox note — PBI-065 reused the ModelSelector component directly, which satisfies the "pattern" requirement.

## 2026-09-12 - PBI-066 → Active (chain)
- Pre-flight done: README Active, EVRSH-65 In Progress. Deps PBI-064 Done; sequenced after PBI-065 (shared api.ts) Done. Implementation (canvas shell) starts next: builder route + StageCard + NodePalette (stages-only) + methodology-graph.ts mapping + api.ts builder load/save appends.

## 2026-09-12 - PBI-066 implemented, gates green (review pending)
- Built: lib/methodology-graph.ts (edge-walked orderStages with named cycle/disconnected errors; loop/route keys preserved by never rewriting stage objects) + 5 unit tests; api.ts putMethodology (JSON PUT); StageCard (handles + lucide-X delete via deleteElements); NodePalette (CommandDialog); builder route (header w/ editable name + mode badges/adder, vertical tabs, RF canvas, Cmd+K, single-chain onConnect, delete-bridging, Sheet placeholder).
- Failed approaches (do not repeat): (1) palette children outside `<Command>` — the vendored CommandDialog leaves the cmdk provider to the caller; crash `reading subscribe` is the symptom; (2) RF nodes need explicit width/height or they stay visibility:hidden in jsdom (invisible to role queries while testids match) — set NODE_W/H at creation, which also kills the production measure-flash; (3) RF deleteElements is async — poll, don't assert sync; (4) cmdk needs scrollIntoView stubbed in jsdom; (5) adding a node must auto-edge from a single tail or every save fails disconnected — implemented, tested; (6) orderStages multi-start handling: walk-first-then-name-unreachable (a second chain IS disconnected nodes; counting chains was vaguer).
- Gates: typecheck clean, 109/109 vitest (10 new), build green with /builder route (21 routes).

## 2026-09-12 - PBI-066 Done (review: agentic)
- Critic CHANGES-REQUESTED → 9 must-fixes applied, regressed to 116/116 + build green. Commits 3eb3bdd + b23cc30 (+ bookkeeping below).
- Fixes: empty-save rejection (lib + page test); closure-bridging rewrite (pre-removal render-scope input — the updater-arg staleness was a REAL regression caught by gates) proven via true multi-select block delete through the UI; fail-loud save (empty-case page test + disconnected/cycle naming lib tests); no-touch preservation proof (loop keys + top-level fields through PUT); connectConstrained extracted + diamond-tested; replace notice + sequential hint; stageMap resync + saved hygiene; writeMethodologyDoc unified core (both save paths, messages stable); Sheet-resizable deferred to PBI-067 with card note.
- Sort rationale: foundation PBI but correctness gate-proven per contract (round-trip, validation, preservation), critic clean after fixes, no UX/product/production judgment (canvas shell on spec'd layout) → agentic, closed to Done. EVRSH-65 Done with evidence comment.
- jsdom boundary (PROVEN by source-level investigation, not assumed): RF edges need measured handle bounds — EdgeWrapper returns null without them, so edge-DOM interaction (click/drag) is untestable in jsdom. Rule: edge TOPOLOGY lives in pure helpers with unit tests (connectConstrained/bridgeDeletions/orderStages); page tests drive node-level UI. Multi-select needs real keydown state (click-event flags don't move RF's tracker). RF `deleteElements` is async (poll). RF `StoreUpdater` syncs props→store; transitions needing the pre-image must use render scope, not setState updater args.
- Carry-forwards: PBI-067 owns inspector content + Sheet resizability + ModelCombobox (+ setup-file extraction for canvas mocks when its test file lands); PBI-069 owns mode removal UI + Budget "plain Form" reading; PBI-070 owns Validate-gating on the saved/dirty states + `<Toaster/>` mount.
- Chained: PBI-067 → Active.

## 2026-09-12 - PBI-067 implemented, gates green (review pending)
- Backend: GET /custom-nodes (ast-parsed listing, never imported; load_error rows instead of silent skips) + CustomNodeInfo model + test (7/7 backend). Flagged: PBI card listed frontend files only, but the palette/inspector REQUIRE a listing the frontend cannot compute without filesystem access — minimal read-only addition, disclosed for sign-off.
- Frontend: RoleEditorDialog extracted from roles page (save errors moved inside dialog; roles tests green unmodified); RoleCard/CustomCodeCard; palette Custom Roles (+create flow) + Custom Code sections; kind-aware graph mapping (role/code/stage, embedded-spec badges, file facts); inspector (stage interrupt switch, role combobox + model/tools overrides on embedded copies + edit-role flow, code read-only card + guarded copy-path); resizable Sheet (drag handle, 320–720px); setup-file mock centralization; ModelCombobox NOT built — ModelSelector reused (PBI-062 component satisfies it; recorded, not silently dropped).
- Data-model decisions (compiler-forced, all in-schema, no compiler change): placement embeds a library snapshot into methodology.custom_roles (compiler resolves stage.node against embedded ids — references alone cannot run); overrides mutate the embedded copy only ("this methodology only"); library combobox switches re-embed fresh; library saves refresh non-customized nodes, customized keep + notice. The input doc's "edits propagate to every methodology" does NOT hold under the as-built compiler (would need compiler change) — implemented the honest snapshot+refresh semantics instead, flagged for sign-off.
- Failed approaches (do not repeat): (1) Base-UI Switch + native label + aria-label triple-names/confuses AT naming — wrapping label alone (checkbox pattern); (2) stub handler order: unguarded endsWith GET branches swallow POST/PUT — method-guard write routes first; (3) open modal inerts background — scope dialog queries with within(), close sheets before header actions; (4) native document events run outside act() — poll with waitFor; (5) RF multi-select needs REAL keydown state (click flags ignored); (6) RF deleteElements is async (poll).
- Gates: typecheck clean, 123/123 vitest (24 new), build green.

## 2026-09-13 - PBI-067 Done (review: agentic)
- Commits b22ac5c + 25704f2 + 74cf58d + bda85a3 + 8647441 (+ bookkeeping below).
- Follow-up 8647441 (explicit 3-file stage, no -A; 2 untracked DOCS left alone): undecodable `custom_nodes/*.py` (UnicodeDecodeError ⊂ ValueError) is a load_error row, never a listing-wide 500 + regression test; model-override OFF reverts only to a non-empty library model (empty library model keeps override ON + notice — the empty "inherit" marker has no runtime resolution and would 400 at run time); override hint copy corrected.
- Gates: typecheck clean, 129/129 vitest (29 files), build green with 21 routes (incl. /builder). Backend targeted 18/18 (test_libraries + test_compiler, incl. new undecodable test). Backend full halves NOT single-process green today: pre-existing Windows native race (langgraph sqlite checkpoint `put` + runs `_save_run`/`_pump` vs fixture-teardown `clear_graph_cache`, 0xC0000005, zero test FAILURES) crashed the units half ×4 and the API half ×2 at fixed teardown sites. Split-green evidence: 206 passed (units excl. brainstorm) + brainstorm 15/15 alone on retry; api_runs subset hit the same-family GitPython cwd race (`.gitignore` FileNotFoundError in `index.add` under live _pump threads). All crash sites are untouched by this PBI's diff (libraries listing + builder page) — infra flake, not product, recorded honestly.
- Sort rationale: card Verification is frontend-only (typecheck + suite + build) and is fully green; backend diff is a 5-line guard + test, proven by targeted 18/18; prior adversarial fixes applied + regressed; internal builder canvas on spec'd layout, no UX/product/security/production judgment → agentic, closed to Done. EVRSH-66 Done with evidence comment (text in chat; no Plane MCP in this env — apply manually).
- Carry-forwards: PBI-068 owns loop-back edges + ConditionBuilder (sequential-only notice in place); PBI-069 owns mode removal UI + Budget "plain Form" reading + roles/tools tabs; PBI-070 owns Validate-gating on saved/dirty + `<Toaster/>` mount.
- Chained: PBI-068 → Active.

## 2026-09-13 - PBI-068 implemented, gates green (review pending)
- Graph lib: compileCondition (count → `len(f) op n`, bool → `f == True|False`, AND-join; empty → null) + parseCondition (strict round-trip of the compile grammar incl. `is`/`is not` spellings; OR/nesting/unknown/type-mismatched → null, never a rewrite) + operatorsForFieldType (counts >, <, ==, !=, never contains) + isLoopEdge/connectLoop (one dashed-amber loop per source, chain untouched) + validateLoops (edge-without-condition, keys-without-edge, unknown-target all fail loud naming the stage; loop_while exempt) + orderStages/bridge/connectConstrained loop-blind + methodologyToFlow draws canvas-owned loops only (loop_condition + resolvable target).
- UI: ConditionBuilder (Field × Operator × Value rows, number input for counts, bound Switch for booleans, + AND, Remove loop, collapsed advanced textarea pre-filled with live round-trip); amber loop handle on all three card kinds; inspector Loop section for every kind (builder / hand-authored note / no-loop hint); loop-drag sets loop_target + opens inspector; dashed-edge click selects source; target-delete clears dependent loop keys + notice; save runs validateLoops after orderStages. api.ts appends listConditionFields only.
- Decisions (recorded, not silently dropped): Field = Select, not Combobox (5 static options; combobox theater — ModelSelector precedent PBI-067); NO @codemirror/lang-javascript (single-line simpleeval, no language to highlight; shadcn Textarea mono — README Tooling explicitly left this to PBI-068); bool compiles to `== True|False` (backend Tier B runtime form, backend-tested); forward loop targets allowed (conditional branch the compiler accepts — refusing would be paternalistic); loop_target-alone hand-YAML round-trips benignly (server ignores, no canvas claim).
- Failed approach (do not repeat): conflict test first used loop_while-only stage expecting the builder error — but loop_while-only correctly shows the hand-authored note; the conflict fires on the actually-invalid both-forms-set shape (card's "two set" case).
- Gates: typecheck clean, 145/145 vitest (29 files; 10 graph + 6 page new), build green with 21 routes. Backend untouched (zero backend files) — no backend gates owed; runtime loop semantics already proven backend-side by Tier B tests (true → loop taken, false → falls through), frontend emits the same grammar.
- Review pending: expression-honesty (no silent rewrites) + byte-identity self-checked (toBe reference test + loop_always page round-trip); independent critic pass still owed before Done.

## 2026-09-13 - PBI-068 Done (review: agentic, via CHANGES-REQUESTED)
- Critic CHANGES-REQUESTED → all 8 must-fixes applied, regressed to 148/148 + build green. Commit 66f8c80 (+ bookkeeping below).
- Fixes, all real: (1) advanced draft copy dropped — textarea binds the stored expression directly (row edits and keystrokes share one source; the stale-draft clobber is structurally impossible); (2) palette tail detection ignored loop edges (append stranded after any loop) — extracted pure chainTailId + tested; (3) dual loop_while+loop_condition slipped past validateLoops to a server 422 — now a loud client error naming the stage (any dual form, per compile.py); (5) conflict test now clicks Save (was vacuous); (6) complex test pins +AND disabled; (7) hand-owned round-trip asserts exact stage shapes + route case added; (8) onConnect loop branch extracted to pure applyLoopConnect + tested (jsdom handle-drag boundary now honestly recorded: pure transition tested, 3-setter application thin).
- Nits taken: api.ts stage type gains loop_always; blank advanced input normalizes to null; count inputs clamp at zero. Declined with rationale: last-row delete keeps keys + loud save error (auto-dropping the edge would surprise); forward/self loop targets allowed (compiler-valid conditional branches); `is`-spelling normalization is display-only until an explicit row edit recompiles.
- Waiver (human-approved 2026-09-13, on card): advanced editor is a shadcn mono Textarea, not CodeMirror (single-line simpleeval — lang-javascript would mis-highlight; view-only CM buys nothing). No new dep.
- Sort rationale: card Verification fully green (compile unit tests incl. operator filtering; Tier B runtime bar rides backend-tested grammar — frontend emits byte-identical forms; complex-disable + byte-identity proven), critic clean after fixes, human waiver on the one divergence, internal builder canvas, no UX/product/security/production judgment → agentic, closed to Done. EVRSH-67 Done with evidence comment.
- Carry-forwards: PBI-069 owns tabs + YAML-editor retirement (+ mode removal UI, Budget plain form, roles/tools tabs); PBI-070 owns Validate-gating + Toaster mount + scratch-project witness (incl. browser proof of loop-handle drag, the one path jsdom cannot reach).
- Chained: PBI-069 → Active.

## 2026-09-13 - PBI-069 Done (review: agentic, via CHANGES-REQUESTED)
- Built (commit ecbb7b3): four tabs on the builder writing through the single canvas PUT (description/models/tools/budget states, Saved-hygiene extended, deliberate no-resync documented); Roles table (ModelSelector per slot, red rows + Why-Tooltips); Tools checkbox grid (restrict-only header, non-registry enables kept + Import/Export pointer); Budget HTML form (2 fields per waiver, per-project pointer); Metadata tab (shared name/modes state, new description); [id] editor retired to a forward + fallback link; list + create retargeted to /builder.
- Critic CHANGES-REQUESTED → 5 must-fixes, all real, in 27c1320: (1) auditor blind spot — the tab mirrored compile.py's rotation set but the SAVE gate (_check_names, verified firsthand) checks every slot but judge, so auditor==judge showed clean then 422d; findJudgeOverlaps now mirrors the stricter gates (docstring corrected), auditor rows flag with their own tip; (3) metadata name test drove the header box — now drives the tab field and asserts header reflection; (4) budget prefill used default fixture identical to fallbacks — now {99, 9}; (5) negative budgets committed — min=1 + handler floor + refusal test. Nits taken: api.ts stage type gains loop_always (from PBI-068 round); ghost-enables note points to Import/Export; tools stub covers 3 registry rows; extra-enables note waits for registry load; Why-button pattern (44px) replaces the focusable span; judge-less hint; PBI-068 whitespace churn repaired.
- Waivers (human-approved 2026-09-13, on card): 2-field Budget tab (max_sources* live on project Settings; 4-field PUT would 422); flat Tools grid (no category metadata exists); ModelSelector for ModelCombobox (never built — PBI-067 precedent).
- Gates: typecheck clean, 153/153 vitest (29 files), build green (21 routes; [id] route retained as forwarder). Backend untouched.
- Sort rationale: verification fully green (live overlap + exact PUT bodies; pre-fills proven non-vacuous; old URL forwards with id; no raw-editor links remain — grep-verified), critic clean after fixes, two human waivers on divergences, internal admin surface → agentic, closed to Done. EVRSH-68 Done with evidence comment.
- Carry-forwards: PBI-070 owns toolbar (Validate/Save/Set-Default/Duplicate/Export/Import), Validate-gating on saved/dirty, `<Toaster/>` mount, + human-gated scratch-project witness (incl. loop-handle drag browser proof).
- Chained: PBI-070 → Active (human-gated witness — chain pauses for the human at the end).

## 2026-09-13 - PBI-070 code-complete, In Review (review: MANUAL — scratch-project witness owed)

- Built (commit 0f6f2ab, 8 files, frontend-only, backend untouched): toolbar Validate (client `validateToolbarInputs` + server `/validate` verdict on the STORED doc, labeled as such) / Save (disabled + titled until an explicit Validate passes on the current canonical key; `buildToolbarDoc` re-checks pre-PUT so no unvalidated path exists) / Set-as-Default confirm Dialog / overflow ⋮ menu (Duplicate with deep-copy + re-id + `is_default=false`; Export YAML read-only dialog + copy; Import YAML with shape gate + foreign-id notice + validation staled); `ValidationToastList.tsx` (persistent red/amber/server readout + "Not validated yet" empty state); api.ts appends (validate/duplicate/export/import only); methodology-graph.ts appends (unknown-ref/hand-loop/ghost-tool helpers); jest-dom v7 + matchMedia/ResizeObserver shims in test-setup.ts.
- Deliberate behavior call (in-scope, recorded): REMOVED the fresh-load auto-validation found in the working tree — it let Save start enabled without an explicit Validate, contradicting the directive letter ("stays disabled until Validate passes") and stranding the "Not validated yet" copy unreachable. Existing tests already drove Validate-first, so removal cost 3 test updates, not churn avoidance.
- Failed approaches (do not repeat): (1) first library-role test fix clicked Save while disabled then expected puts=1 — a disabled button never fires; Validate-then-Save-once is the pattern; (2) duplicate stub matched `url === "/api/v1/methodologies"` but api.ts prefixes BASE — match by endsWith; (3) `@testing-library/jest-dom` bare root has no type entry in v7 (runtime ok, tsc fails) — import `@testing-library/jest-dom/vitest`; (4) full-file 5s default timeout flakes under load (loop-target test took 19s once, 853ms isolated) — pass `--testTimeout 30000` for the builder file, not a product defect.
- Gates: typecheck clean, 160/160 vitest (29 files; 7 new toolbar tests), build green (21 routes). Backend untouched — no backend gates owed.
- Critic CHANGES-REQUESTED → must-fix applied in da20962: export test was helper-only (never touched the dialog — would pass with the dialog deleted); now UI-driven (⋮ → Export YAML → dialog text parses to `{...METHODOLOGY, custom_roles: []}`, pinning the constructor path). Nits applied: duplicate refusal comment corrected, `setName(doc.name ?? "")` import guard. Declined with rationale: raw-422 verbatim display (shared-helper precedent), postValidate prefix style, 409/server-invalid unpinned paths (inspected-correct).
- Sort rationale: code deterministic-green + critic-clean, BUT the directive's witness clause (compose in builder → scratch-project default → run → custom stage in log + loop per condition → human confirms) is a human gate by design → manual, stays In Review until witnessed. EVRSH-64 needs manual Plane move to In Review + resolution comment (no Plane MCP in this env — text in chat).
- Chain PAUSED here by design (manual sort). PBI-070 closes to Done only on explicit human witness sign-off; production default untouched until the human says otherwise.

## 2026-09-14 - Phase-6 planned (PBI-071–083) + D3 resolved + PBI-071 Done

- Plan: `specs/phase-6-analog-enhancements/spec.md` (C1–C11, D1–D6) +
  13 cards + README sequencing (commits 16cb0b7 DOCS inputs, 5f9dc30 plan).
  Push-created 13 × Todo (map 071→71, 072→81, 073→83, 074→75, 075→73,
  076→80, 077→82, 078→76, 079→79, 080→77, 081→74, 082→78, 083→72).
- D3 RESOLVED: operator supplied `Feature-Extraction-v1.md`; row-by-row
  diff found 3 guide gaps → PBI-081 (pass-rate metric), PBI-082 (source
  viewer), PBI-083 (structure editor). Capability correction: `skills` CLI
  exists (prior "absent" records wrong); no new skills/packages adopted.
- PBI-071 Done (agentic, commits 6471592 + 17d089b, EVRSH-71 Done):
  ThreadPoolExecutor dispatch, workers read-only + model call, debate
  writes post-join in order, charging unchanged. Critic caught a REAL race
  (concurrent lazy index rebuild — tantivy writer / lancedb delete+add) →
  fixed with single-threaded warm-up + real-index regression test
  (test_targeted_warms_stale_index_before_pool); overlap proven by
  Barrier rendezvous (no wall-clock asserts). Nits taken (worker cap 32,
  top-level import, 10s barrier).
- Harness note (do not repeat this investigation): API half crashed 6×
  today at the known teardown race (clear_graph_cache vs live _pump +
  langgraph checkpointer puts, zero product frames every time). Proven
  inert to this PBI: all API mocks return empty findings → zero pending
  tasks → pool path untaken in that file. Green evidence WITH the change:
  units 223 + API 25 full-file + 6+19 split. Adjacent work (not this
  chain): harden the fixture (join _pump threads before
  clear_graph_cache) — file as future PBI, do not sneak into a feature.
- Chained: PBI-072 → Active.

## 2026-09-14 - PBI-072 Done (review: agentic, APPROVE + nit)

- Built (commits 2b7e828 + 94bcf74): `compute_consensus` (tier weights,
  dangling-safe, null percent on zero) on detail + list rows (N+1 per
  PBI-015 precedent); `ConsensusMeter.tsx` (emerald/amber, "no weighted
  sources" empty state — deliberate deviation from the sketch's fake
  50/50, recorded); modal + table-column integration beside (never
  instead of) the confidence breakdown; api.ts types.
- Failed approach (do not repeat): required-typed `consensus` crashed
  the modal on stale-shape stubs — component now tolerates absence
  (fail-soft like tasks/audit in the same file) AND stubs updated to the
  real shape; both halves, not one.
- Gates: typecheck, 163/163 vitest (30 files; 3 new), build green;
  backend units 215 + targeted 38, API half 25 full-file green.
  Harness race hit units-half 3× at the fixed teardown site (zero
  product frames; crashing file has zero claims references) — split
  evidence stands per precedent.
- Critic APPROVE; nit fixed (vanishing-row zero-weight shape keeps the
  row type total). Sort: internal operator surface, gate-proven, no
  human judgment → agentic. EVRSH-81 Done.
- Chained: PBI-073 → Active.

## 2026-09-14 - PBI-073 Done (review: agentic, APPROVE + hardening)

- Built (commits 3e2e1e5 + dc9e6da): start_run scope/pins validation
  (422/404, fail-closed pre-record) + freeze into state (NotRequired) +
  record (memory + runs.db columns + rehydrate + GET payload; list shape
  untouched by design); investigator closed-corpus prompt block;
  extraction allowed_urls gate (no outside minting); dialog scope Select
  always posted; pins API-only. No compiler/storage redesign.
- Test honesty catch (own): prompt test keyed users by system substring
  — the scientist prompt name-drops "Investigator", misattributing the
  no-block user. Re-keyed by distinct model ids. Lesson: never match
  roles by prompt substrings; _mock_llm's order (Scientist first) hides
  the same trap.
- Process failure (do not repeat): two gratuitous whitespace edits
  mangled live lines (test def + rehydrate indent) — caught by ast
  check before running. Rule restated: NO edit without a functional
  reason; syntax-check after every backend edit batch.
- Gates: typecheck, 165/165 vitest (31 files; 2 new), build green;
  backend new tests green (2 council + 3 API), units-minus-methodology
  217 green, api chunk-A 6/6. Full-file halves blocked by hot harness
  race all session (teardown clear_graph_cache vs live _pump +
  checkpointer puts; one flaky FileNotFoundError from the GitPython
  chdir race, same family). Pre-existing tests proven shape-safe
  (exact-assert audit); crashing files have zero references to the new
  code. Split evidence stands per precedent.
- Critic APPROVE; hardening taken (any unreadable pin id → 404 +
  regression); declined with rationale: list_runs parity (exact-keys
  test, GET is the record), start-response symmetry (exact-response
  contract). Sort: internal surface, gate-proven → agentic. EVRSH-83
  Done with evidence comment.
- Chained: PBI-074 → Active (pre-flight done; implementation next).

## 2026-09-14 - PBI-074 code-complete, In Review (review: MANUAL — D7 veto)

- Built (commits a7b5a24 + ed086e1): coverage_check (CORRECTED guide
  type error: source-linkage, not source-vs-evidence ids; deterministic
  R-coverage-check id; route_coverage) + meta_review (MAJOR_GAP loop,
  round-charging, exhaustion short-circuit) + registry/routes; meta
  exclusion (optional param, 4 call sites); prompt files; research +
  ACADEMIC defaults wired (uniform pre-synthesis rule) with meta model
  (= judge model, sanctioned — only non-council value available);
  brainstorm/witness pipelines untouched. EVRSH-75 stays In Progress
  with evidence comment.
- Two REAL regressions caught by gates mid-flight, both fixed: (1) new
  meta key in effective council tripped judge-overlap → every default
  run 400d (fixed at get_graph + 3 sites; ideator deliberately stays
  IN the check); (2) research-only wiring tied the academic-cost gate
  6==6 (academic wired too — restored strict inequality + functional
  parity). Both have regression tests.
- Critic CHANGES-REQUESTED → 1 must-fix applied (route_coverage
  exhaustion guard + test; keeps budget leak out). Confirmed sound:
  meta==judge (D5 requires meta∉council only), brainstorm exclusion,
  academic route validity, D7 handling. Declined with rationale:
  first-line MAJOR_GAP check (substring is fail-closed; exact match
  risks silent pass), coverage-id router pinning (pending always []
  on arrival by invariant).
- D7 VETO OWED (the chain pauses here): Task 59 needs a plan Scientist
  call that was never built — addendum shipped verbatim + loadable +
  pinned, activation deferred. Human decides: accept / demand
  plan-realization PBI / revert. Sort rationale: code green +
  critic-clean, but D7 is human judgment → manual by doctrine.
- Gates: 59 targeted + 7 academic + 10 methodology + 227 units-split +
  3 run-start, all green on final tree; frontend untouched (no gates
  owed). Full-file halves blocked by hot harness race (same teardown
  signature throughout; zero product frames; new-code files all green
  in isolation/split).

## 2026-09-14 - PBI-075 Done (review: agentic, APPROVE + 3 nits taken)

- Built (commits 1447f25 + b8ccba2): cluster_objects (0.90) +
  identical-behavior cluster_sources wrapper (0.92); duplicates/ dir +
  write/read_duplicate_report (plain YAML, committed, schemas
  untouched); _cluster_claims_ideas (multi-member only, empty kinds
  skipped silently) under the existing non-fatal hook contract.
- Gates: dedup/store 23 green (exact 0.91-split pin, hook reports,
  guard + fault + allow-list tests); units 218+15 split-green;
  methodology 10/10 green (equivalent tree). Full-file heat crashes
  as documented (zero product frames throughout).
- Critic APPROVE; all 3 nits taken (distinct-pairs guard case,
  claims-branch fault test, kind allow-list traversal guard). Sort:
  backend-only, gate-proven, no human judgment → agentic. EVRSH-73
  Done with evidence comment.
- Chained: PBI-076 → Active.
