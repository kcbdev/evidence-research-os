# ARCHITECTURE.md — Evidence Research OS (as-built snapshot)

> **As-built, not gospel.** This file describes what exists *right now*. It is
> changeable via ADR (`docs/adrs/`); dead structure found later is corrected
> here, never silently in code.

**Snapshot date:** 2026-09-05 (ASDLC onboarding).
**State:** docs-only repo. No `backend/`, no `frontend/`, no `lab-projects/`
yet — all arrive via asdlc-plan PBIs (Phase 0 scaffold first).

## Modules (planned per DOCS v1 — none implemented yet)

| Area | Boundary | Data flow |
|---|---|---|
| `backend/app/models/` | Pydantic v2 schemas: Source, Claim, Evidence, Contradiction, Experiment, Decision, Task, Idea, BudgetState, ProjectMeta | YAML ↔ model round-trip, lossless |
| `backend/app/store/` | `LabProjectStore`: filesystem CRUD + git commit-per-write | Only writer of Lab Project YAML; API/agents never touch disk directly |
| `backend/app/graph/` | LangGraph `LabProjectState` + 13 nodes, SQLite checkpointer per project, `interrupt_before=["human_checkpoint"]` | START → classifier → plan → first-pass → extraction → conflict → review → adjudication → synthesis → audit → checkpoint → output |
| `backend/app/agents/` | Role prompts + OpenRouter client; `validate_model_assignment` startup check | Council models ≠ judge model, enforced, not conventional |
| `backend/app/tools/` | ripgrep wrapper, web/PDF fetch, tool-output cache | Every fetch through `tool_outputs/<session>/` cache keyed by URL/DOI hash |
| `backend/app/api/` | FastAPI `/api/v1`: lab-projects, runs (+SSE stream, +approve), claims (SQLite view), decisions, budget, output | Sole dependency of the frontend |
| `frontend/` | Next.js 16 pages: dashboard, lab overview, claims, ideas, graph, run view, audit, output, settings | REST + SSE only; no direct filesystem/DB access |

## Storage

- Source of truth: Lab Project directory tree (`project.yaml`, `question.md`,
  `sources/`, `claims/`, `ideas/`, `evidence/`, `contradictions/`,
  `experiments/`, `tasks/`, `decisions/`, `debates/`, `audits/`, `product/`,
  `output/`, `tool_outputs/`).
- Derived, gitignored, rebuildable: `.index/` (Tantivy BM25, LanceDB vectors),
  SQLite claims view, per-project `checkpoint.sqlite`.
- Audit trail: one git commit per store write inside each Lab Project repo.

## Known constraints

1. Judge-model exclusion is load-bearing (self-preference bias) — hard check.
2. Budget controller (`max_model_calls`, `max_research_rounds`) stops runs
   cleanly; trigger classifier runs before any full-council escalation.
3. Retrieval is iterative narrow → read → narrow again; Tier 2/3 deferred to
   Phase 3 (MVP runs on ripgrep deliberately).
4. Human checkpoints after PLAN and SYNTHESIS; single pause mechanism.
5. Single-operator, no auth/billing; grey literature is first-class evidence.
