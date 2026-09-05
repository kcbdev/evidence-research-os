# Spec: phase-0-scaffold

## Goal

Stand up the repository skeleton every later phase builds on: a Python
backend tree with round-tripping domain models, a filesystem store layer
that is the only writer of Lab Project data, per-project git audit history,
a Next.js frontend shell, and Coolify services + data volume — so that
Phase 1 can implement orchestration, agents, API, and UI against real
boundaries instead of scaffolding.

## Scope

- In scope (plan tasks 1–5):
  - `backend/` tree (`app/main.py`, `config.py`, `models/`, `store/`,
    `graph/`, `agents/`, `tools/`, `api/`, `tests/`) with
    `backend/pyproject.toml` (requires-python >=3.12, deps per guide §0).
  - `uv` standardized as the Python manager (`uv sync` reproducible).
  - Pydantic v2 models for every §4.2 object type: Source (all 9 kinds,
    quality_tier 1–9, independence_cluster), Claim (all 7 statuses,
    5-dimension confidence, adjudicated_by), Evidence, Idea, Task,
    Decision, BudgetState (with `exhausted()`), ProjectMeta
    (council_models + judge_model).
  - `LabProjectStore`: layout creation, typed read/write/list per object
    type, YAML round-trip without loss; the ONLY writer of object YAML.
  - Git init per Lab Project on creation; one commit per store write.
  - `frontend/` via `create-next-app --typescript --tailwind --app`
    (no data-fetching library).
  - `lab-projects/` data dir, gitignored from the app repo.
  - Coolify: backend (:8000) + frontend (:3000) services, persistent
    volume mounted at `/data/lab-projects` (`LAB_PROJECTS_ROOT`).
- Out of scope: graph nodes, agent prompts, MCP tools, API routers,
  UI pages (all Phase 1); Tantivy/LanceDB (Phase 3); Brainstorm mode
  (Phase 2). No non-negotiable deviations from guide §0 layout.

## Contracts (success criteria)

- A Lab Project directory can be created by hand and every object YAML
  round-trips through its Pydantic model without loss.
- `LabProjectStore` write of each object type produces exactly one git
  commit with a descriptive message; `git log` reads as project history.
- `uv sync` reproduces the backend env on this machine; `pytest`
  collects the backend suite.
- Coolify shows both services healthy with the volume mounted
  (`LAB_PROJECTS_ROOT=/data/lab-projects`).

## Anti-patterns

- Hand-editing object YAML outside the store helpers — schema drift source.
- Batching/deferring git commits "for performance" — the audit trail is
  the point (cheap now, expensive to retrofit).
- Adding Tantivy/LanceDB before Phase 3 — MVP runs on ripgrep deliberately.
- Committing `lab-projects/` data or `.index/` output to the app repo.

## Decisions

- Filesystem-as-source-of-truth; indices derived and gitignored
  (spec §4, `ARCHITECTURE.md` constraints).
- No Postgres anywhere in v1; SQLite per Lab Project (checkpoints,
  claims view).
- Judge-model exclusion enforced as startup check, not convention
  (implemented Phase 1, contracted here via `ProjectMeta` schema).

## Tooling

- `uv` (approved this plan) — env + dep management.
- `pytest` 9.1.1 (installed at onboarding) — deterministic gate runner.
- Adopted skills: `langgraph-persistence`, `langgraph-human-in-the-loop`
  (used Phase 1; recorded here so PBIs can cite them).
