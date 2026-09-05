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
