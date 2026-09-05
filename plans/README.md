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

## Statuses (`Proposed` → `Active` → `In Review` → `Done` / `Blocked`)

| PBI | Status | PBI | Status |
|---|---|---|---|
| PBI-001 | Done | PBI-011 | Proposed |
| PBI-002 | Done | PBI-012 | Proposed |
| PBI-003 | Done | PBI-013 | Proposed |
| PBI-004 | Done | PBI-014 | Proposed |
| PBI-005 | In Review | PBI-015 | Proposed |
| PBI-006 | Done | PBI-016 | Proposed |
| PBI-007 | Done | PBI-017 | Proposed |
| PBI-008 | Done | PBI-018 | Proposed |
| PBI-009 | Done | PBI-019 | Proposed |
| PBI-010 | Active | | |

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
