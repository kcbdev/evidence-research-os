# Plan: Phase 0 scaffold + Phase 1 MVP (Deep Research)

PBIs live in `tasks/PBI-{NNN}.md`; specs in `specs/`; progress in `PROGRESS.md`.
Scope: plan tasks 1–20 (guide: Phase 0 + Phase 1 MVP). Phases 2–4 get their
own specs/PBIs after MVP validates on a real topic. No milestone hierarchy —
ordering only.

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
| PBI-010 | Done | PBI-020 | Proposed |
| PBI-021 | Proposed | | |
| PBI-022 | Done | | |
| PBI-023 | Done | | |
| PBI-024 | Done | | |
| PBI-025 | Done | | |
| PBI-026 | Done | | |
| PBI-027 | Done | | |
| PBI-028 | Done | | |
| PBI-029 | Proposed | | |
| PBI-030 | Done | | |
| PBI-031 | Done | | |
| PBI-032 | Done | | |
| PBI-033 | Done | | |
| PBI-029 | Proposed | | |

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
