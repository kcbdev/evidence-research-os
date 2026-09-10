# Plan: Phase 0 scaffold + Phase 1 MVP (Deep Research) + Phases 2–5b

PBIs live in `tasks/PBI-{NNN}.md`; specs in `specs/`; progress in `PROGRESS.md`.
PBI-001–033 (Phase 0/1 + UX overhaul) are done except PBI-005's human deploy
remainder. What follows plans the remaining DOCS (API Reference, Frontend UX
gaps, Implementation Guide Phase 2–4, Phase 5, Phase 5b) as PBI-034–061.
No milestone hierarchy — ordering only.

## Execution order

1. PBI-001 — Repo scaffold + uv toolchain
2. PBI-002 — Pydantic evidence models (needs PBI-001)
3. PBI-003 — Filesystem store + CRUD helpers (needs PBI-002)
4. PBI-004 — Git-per-project + commit-on-write (needs PBI-003)
5. PBI-005 — Coolify services + data volume (needs PBI-001)
6. PBI-006 — Graph state + checkpointer + skeleton (needs PBI-002, PBI-003)
7. PBI-007 — Budget controller (needs PBI-006)
8. PBI-008 — Agent prompts + judge exclusion (needs PBI-007)
9. PBI-009 — Retrieval + fetch tools (needs PBI-008)
10. PBI-010 — Tool-output cache (needs PBI-009)
11. PBI-011 — Council loop (needs PBI-006, PBI-008, PBI-010)
12. PBI-012 — Review + adjudication + synthesis (needs PBI-008, PBI-011)
13. PBI-013 — Audit + repair + checkpoint + output (needs PBI-012)
14. PBI-014 — Lab-projects + runs API (needs PBI-013)
15. PBI-015 — Claims/decisions/budget/report API (needs PBI-003, PBI-014)
16. PBI-016 — Dashboard + overview shell (needs PBI-001, PBI-014)
17. PBI-017 — Claims table + trace modal (needs PBI-015, PBI-016)
18. PBI-018 — Run view + approval modal (needs PBI-014, PBI-016)
19. PBI-019 — End-to-end MVP validation, human-gated (needs PBI-016–018)
20. PBI-020 — Archive Lab Project (needs PBI-014; Phase 1 backlog)
21. PBI-021 — Task deep-link surface (needs PBI-017; badge href follow-up)
22. PBI-022 — Retry transient model failures (needs PBI-008; live-fire backlog)
23. PBI-023 — Adjudication writes confidence (needs PBI-012; witness finding)
24. PBI-024 — Runs history (needs PBI-014; witness finding)
25. PBI-025 — Presentation pass (needs PBI-016/017; witness finding)
26. PBI-026 — Approval dossier (needs PBI-015/018; witness finding)
27. PBI-027 — Modal dark mode (needs PBI-017/018; witness finding)
28. PBI-028 — Model settings UI (needs PBI-014/016; witness follow-up, backlog)
29. PBI-029 — Persist runs (needs PBI-014; witness follow-up, backlog)
30. PBI-030 — shadcn foundation + AppShell (needs none; UX overhaul)
31. PBI-031 — Dashboard + overview on shadcn (needs PBI-030)
32. PBI-032 — Claims + trace dialog on shadcn (needs PBI-030)
33. PBI-033 — Run view on shadcn + sign-off (needs PBI-031/032)

## Statuses (`Proposed` → `Active` → `In Review` → `Done` / `Blocked`)

| PBI | Status | PBI | Status |
|---|---|---|---|
| PBI-001 | Done | PBI-011 | Done |
| PBI-002 | Done | PBI-012 | Done |
| PBI-003 | Done | PBI-013 | Done |
| PBI-004 | Done | PBI-014 | Done |
| PBI-005 | In Review | PBI-015 | Done |
| PBI-006 | Done | PBI-016 | Done |
| PBI-007 | Done | PBI-017 | Done |
| PBI-008 | Done | PBI-018 | Done |
| PBI-009 | Done | PBI-019 | Done |
| PBI-010 | Done | PBI-020 | Done |
| PBI-021 | Done | | |
| PBI-022 | Done | | |
| PBI-023 | Done | | |
| PBI-024 | Done | | |
| PBI-025 | Done | | |
| PBI-026 | Done | | |
| PBI-027 | Done | | |
| PBI-028 | Done | | |
| PBI-029 | Done (2026-09-10) | | |
| PBI-030 | Done | | |
| PBI-031 | Done | | |
| PBI-032 | Done | | |
| PBI-033 | Done | | |
| PBI-034 | Done | PBI-035 | Done |
| PBI-036 | Done | PBI-037 | In Review (manual: live witness) |
| PBI-038 | In Review | PBI-039 | Proposed |
| PBI-040 | Proposed | PBI-041 | Proposed |
| PBI-042 | Proposed | PBI-043 | Proposed |
| PBI-044 | Proposed | PBI-045 | Proposed |
| PBI-046 | Proposed | PBI-047 | Proposed |
| PBI-048 | Proposed | PBI-049 | Proposed |
| PBI-050 | Proposed | PBI-051 | Proposed |
| PBI-052 | Proposed | PBI-053 | Proposed |
| PBI-054 | Proposed | PBI-055 | Proposed |
| PBI-056 | Proposed | PBI-057 | Proposed |
| PBI-058 | Proposed | PBI-059 | Proposed |
| PBI-060 | Proposed | PBI-061 | Proposed |

## Dependency graph

```text
001 -> 002 -> 003 -> 004
 |      |      |-> 006 -> 007 -> 008 -> 009 -> 010 -+
 |      |            |                          v   |
 |      |            +----------------------> 011 -> 012 -> 013 -> 014 -> 015 -> 017
 |      |-> 005                                     |                    |      ^
 |                                                  |-> 016 -------------+      |
 |                                                      |-> 018 ---------------+
 |                                                      v
016,017,018 -> 019 (human gate)
```

Parallel-safe pairs (disjoint files): {002,005}, {004,005}, {016,015},
{017,018}. Same-file chains run sequenced, never parallel: nodes.py
(006→011→012→013), main.py (014→015), store (003→004).

## Execution order — Phases 2–5b (PBI-034–061, planned 2026-09-10)

Specs: `specs/phase-2-brainstorm/`, `specs/phase-3-audit-retrieval/`,
`specs/phase-4-academic-search-handoff/`,
`specs/phase-5-methodology-registry/`,
`specs/phase-5b-user-authorable-logic/`.

34. PBI-034 — Ideator + novelty_check + mode wiring
35. PBI-035 — Brainstorm skeptic rubric + idea lifecycle (needs 034)
36. PBI-036 — Ideas API (order after 034; disjoint files, parallel-safe)
37. PBI-037 — Ideas board UI + Phase-2 witness, human-confirmed (needs 036)
38. PBI-038 — Settings fallback API (no deps; parallel-safe)
39. PBI-039 — citation_verify + 3-stage audit + results store (needs 038)
40. PBI-040 — Audits API + audit UI (needs 039)
41. PBI-041 — Tantivy keyword index + wiring (no deps; parallel-safe)
42. PBI-042 — LanceDB/fastembed semantic index (no deps; parallel-safe)
43. PBI-043 — Dedup clustering post-run hook (needs 042)
44. PBI-044 — Retry from checkpoint + runs.db evolution (needs PBI-029 done)
45. PBI-045 — Graph endpoint + explorer + claims-filter alignment (no deps)
46. PBI-046 — Shared cross-project index + GET /search (needs 042)
47. PBI-047 — Search page + nav gating (needs 046)
48. PBI-048 — Academic mode segment (needs 034)
49. PBI-049 — Product notes API + Output + Decisions pages (no deps)
50. PBI-050 — New-lab flow + run-start dialog + runs history (no deps, frontend-only)
51. PBI-051 — labs.kcb.ma handoff mapping, human-pushed (needs 049)
52. PBI-052 — Approval edit-and-continue (order after 044; same-file chain runs.py)
53. PBI-053 — Registries + Methodology schema + compiler (needs 048)
54. PBI-054 — Capture 3 methodologies + delete hardcoded builder (needs 053)
55. PBI-055 — Methodology store + API (needs 053; parallel-safe with 054)
56. PBI-056 — methodology_id run-start/create + picker + history (needs 054, 055, 050)
57. PBI-057 — Methodologies settings UI (needs 055)
58. PBI-058 — Tier A custom roles (needs 053; parallel-safe with 059/060)
59. PBI-059 — Tier B expression conditions (needs 053; parallel-safe)
60. PBI-060 — Tier C custom_nodes discovery (needs 053; parallel-safe)
61. PBI-061 — Phase-5b witness, human-gated (needs 058, 059, 060)

## Dependency graph — Phases 2–5b

```text
034 -> 035 -> 036 -> 037 (Phase-2 witness, human gate)
038 -> 039 -> 040
041 (tantivy) || 042 (lancedb) || 038-chain || 045
042 -> 043 | 042 -> 046 -> 047
029(done) -> 044 -> 052
034 -> 048 -> 053 -> 054 -+-> 056 (also needs 055, 050)
                 |-> 055 -+      +-> 057 (needs 055)
                 |-> 058 -+-> 061 (human gate)
                 |-> 059 -+
                 |-> 060 -+
049 -> 051 (human push) | 050 (frontend-only, free) | 049 (free)
```

Same-file chains (sequenced, never parallel): nodes.py (034→035→048→043-hook),
build.py (034→048→054-deletion), runs.py (034-mode→044→052→054-cutover→056),
claims.py (045-filters→049-envelope, internal order), methodology.py
(053→058→059), compile.py (053→058→059→060), main.py mounts (any order, one
PBI per mount — trivially mergeable at execution).
Parallel-safe openers: {034, 038, 041, 042, 045, 049, 050} (disjoint files).

## Gate plan — Phases 2–5b (extends the above, unchanged commands)

- Human gates: PBI-037 (Phase-2 witness), PBI-051 (external push),
  PBI-061 (5b witness). Methodology set-default confirm is UI-level.
- Review gates: adversarial vs the phase spec + `ARCHITECTURE.md`;
  PBI-054 gets a parity-diff review (no fork); PBI-060 gets an
  honesty review (no sandboxing theater).
- Watch items: tantivy/lancedb Windows wheels; fastembed first-run model
  download (tests must seam-mock, never download); Keystatic schema drift
  (PBI-051 stops, never guesses).

## Gate plan

- Deterministic gates: `python -m pytest tests/ -q` (repo),
  `python -m pytest backend/tests -q` (from PBI-001),
  `cmd /c "npm.cmd --prefix frontend run typecheck"` + `... test"` (from PBI-016).
  No PBI starts until its gate is runnable (Ralph Loop).
- Review gates: adversarial + constitutional review vs Spec contracts +
  `ARCHITECTURE.md`; review-type sorting (agentic vs manual) at close-out.
- Human gates: spec approval before PBI-001; PBI-005 deploy check;
  PBI-019 full checklist witness (MVP release decision).
- Blast-radius notes: no `.codegraph/` index and no code yet — "Files touched"
  comes from the guide §0 layout, not measured. Run `codegraph init` once
  `backend/` lands (PBI-001) and re-verify from PBI-006 on.

## Tooling (adopted this plan — Specs/PBIs may cite)

- Skills: `langgraph-human-in-the-loop`, `langgraph-persistence`
  (installed global, opencode). Declined for now: nextjs-app-router-patterns,
  fastapi (official) — reinstall on request if execution needs them.
- Tools: `uv` (PBI-001 installs), `pytest` 9.1.1 (installed).
- Capability discovery (2026-09-10, Phases 2–5b): no `skills` CLI exists in
  this environment (offline), so no skills.sh lookup was possible — and none
  is needed. New capabilities are plain pip deps installed by their consumer
  PBIs on approval: `tantivy` (PBI-041), `lancedb` + `fastembed` + `numpy`
  (PBI-042), `simpleeval` (PBI-059). No third-party agent skills adopted;
  methodology stays ASDLC-only.

## Plane sync

- **Bound to Plane:** `kcb` / `EVRSH` (`d9629f4e-9f78-4ab1-b547-dd370bde0908`)
  — verified live via `plane-kcb` MCP on 2026-09-05.
- **Backlog is ignored until moved to Todo.** Only `Todo` issues seed PBIs.
- **Seed (2026-09-05):** `0 — no Todo issues found` (project empty).
  This plan's PBIs come from slicing `DOCS/` Phase 0+1. Push-create of
  per-PBI `Todo` issues (step 6b) NOT requested — ask before syncing.
- **Push-create (2026-09-06, on user flag):** all 21 PBIs now have
  Plane issues, created with true statuses — 17 × Done (PBI-001–004,
  006–018), 2 × In Progress (PBI-005 infra = EVRSH-2, PBI-019 release
  = EVRSH-21), 2 × Backlog (PBI-020 = EVRSH-18, PBI-021 = EVRSH-20).
  Full PBI↔issue map: PBI-001→1, 002→3, 003→5,
  004→4, 005→2, 006→6, 007→7, 008→8, 009→14, 010→13, 011→11, 012→10,
  013→9, 014→12, 015→15, 016→16, 017→17, 018→19, 019→21, 020→18,
  021→20. Each card's Context carries its `Plane: kcb/EVRSH-N` link.
- **Push-create (2026-09-10, Phases 2–5b plan):** 28 × Todo, one per
  PBI-034–061. Parallel creation interleaved sequence_ids — map by PBI
  number, not creation order: 034→34, 035→36, 036→35, 037→37, 038→40,
  039→39, 040→38, 041→41, 042→43, 043→47, 044→45, 045→44, 046→42,
  047→46, 048→48, 049→49, 050→51, 051→50, 052→52, 053→53, 054→54,
  055→55, 056→58, 057→60, 058→59, 059→57, 060→56, 061→61
  (identifier `kcb/EVRSH-N`). Each card's Context carries its link.
  Plane issues, created with true statuses — 17 × Done (PBI-001–004,
  006–018), 2 × In Progress (PBI-005 infra = EVRSH-2, PBI-019 release
  = EVRSH-21), 2 × Backlog (PBI-020 = EVRSH-18, PBI-021 = EVRSH-20).
  Full PBI↔issue map: PBI-001→1, 002→3, 003→5,
  004→4, 005→2, 006→6, 007→7, 008→8, 009→14, 010→13, 011→11, 012→10,
  013→9, 014→12, 015→15, 016→16, 017→17, 018→19, 019→21, 020→18,
  021→20. Each card's Context carries its `Plane: kcb/EVRSH-N` link.
