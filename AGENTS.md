# AGENTS.md — Evidence Research OS (ASDLC Constitution)

Plane workspace: kcb
Plane project: d9629f4e-9f78-4ab1-b547-dd370bde0908 (EVRSH)
<!-- MCP server: plane-kcb (X-Workspace-slug: kcb). Bound 2026-09-05, verified live via plane-kcb project list. -->

Single-operator research + brainstorm engine for KCB Labs. Filesystem is the
source of truth; every derived index is regeneratable and gitignored.

## 1. Stack

- **Backend:** Python >=3.12, FastAPI, LangGraph (+ langgraph-checkpoint-sqlite),
  Pydantic v2, OpenRouter via OpenAI-compatible client. Managed with `uv`
  when available, else stdlib `venv` + `pip`. (uv not yet installed on this
  machine — Phase 0 PBI installs/standardizes it.)
- **Frontend:** Next.js 15 (TypeScript, Tailwind, app router), native
  `fetch` + `EventSource` only — no extra data-fetching library for MVP.
- **Retrieval tiers:** Tier 1 ripgrep (MVP default) → Tier 2 Tantivy BM25
  (Phase 3) → Tier 3 LanceDB + fastembed (Phase 3, dedup + cross-project only).
- **Deploy:** Coolify/Hetzner — two services (backend :8000, frontend :3000)
  + persistent volume at `/data/lab-projects` (`LAB_PROJECTS_ROOT`).
  No Postgres anywhere in v1; SQLite per Lab Project for checkpoints/claims view.

## 2. Commands (PowerShell 5.1 — `.ps1` wrappers blocked)

- `cmd /c "npm.cmd ..."` / `npx.cmd` for all Node invocations; never POSIX sh.
- `wsl bash -c "..."` only if a dependency genuinely requires it.

## 3. Deterministic gates (Ralph Loop verifies against these — no PBI starts without a runnable gate)

| Scope | Command | Status |
|---|---|---|
| Repo smoke | `python -m pytest tests/ -q` | LIVE (3 tests, onboarding seed) |
| Backend | `python -m pytest backend/tests -q` | activates when `backend/` lands (Phase 0 PBI) |
| Frontend typecheck | `cmd /c "npm.cmd --prefix frontend run typecheck"` (`tsc --noEmit`) | activates when `frontend/` lands |
| Frontend tests | `cmd /c "npm.cmd --prefix frontend test"` | activates when `frontend/` lands |

## 4. Conventions

- **No change without a spec** — including one-line fixes (compact behavior
  contract, 2–4 sections, satisfies this). Specs live at `specs/{feature}/spec.md`;
  deltas are `tasks/PBI-{NNN}.md`; sequencing in `plans/README.md`.
- **Filesystem discipline:** all Lab Project writes go through the store
  helpers (`app/store/lab_project.py`); never hand-edit object YAML outside
  them. Every store write = one git commit in the Lab Project repo
  (audit trail; cheap now, expensive to retrofit — Phase 0 task 5).
- **Judge-model exclusion is a hard startup check**, not a convention:
  `validate_model_assignment` refuses any run where the judge model overlaps
  a council model (self-preference bias). MVP validates this by deliberately
  misconfiguring once (guide §7 checklist).
- **Retrieval discipline:** iterative narrow → read → narrow again; never
  single-shot grep. Tool outputs cached under `tool_outputs/<session_id>/`
  keyed by URL/DOI hash — check before every fetch, no exceptions.
- **Micro-commits:** one logical change per commit, conventional message;
  legacy history (pre-onboarding: none — repo was docs-only) left untouched.
- **Human checkpoints** after PLAN and after SYNTHESIS (per-Lab-Project
  configurable); graph pauses via `interrupt_before=["human_checkpoint"]`,
  resumes via `POST .../runs/{run_id}/approve`. No parallel pause mechanism.
- Structural decisions → `docs/adrs/`; dead structure found later is
  corrected in `ARCHITECTURE.md` via ADR, never silently in code.

## 5. Context Map

```yaml
project_structure:
  DOCS/:
    responsibility: "V1 source documents (spec, implementation plan, Phase 0/1 guide). Read-only inputs to asdlc-plan Spec authoring — superseded by specs/ once reversed/reviewed, never edited in place."
  specs/:
    responsibility: "Human-reviewed Specs, one dir per feature (Spec Reversing gate output). The state asdlc-plan derives PBIs from."
  tasks/:
    responsibility: "PBI delta cards (PBI-NNN.md) — the only unit asdlc-execute works on."
  plans/:
    responsibility: "Sequencing index (README.md) + progress log (PROGRESS.md). Plane Todo seed recorded here."
  backend/:
    responsibility: "FastAPI app (models/store/graph/agents/tools/api). Does not yet exist — Phase 0 PBI scaffolds it per guide §0."
  frontend/:
    responsibility: "Next.js 15 control panel. Consumes /api/v1 exclusively — no direct filesystem/DB access. Does not yet exist — Phase 1d PBI."
  lab-projects/:
    responsibility: "Data volume (gitignored here; separate git remote per Lab Project, own history). Never committed to the app repo."
  tests/:
    responsibility: "Repo-level deterministic gates. Grows into backend/frontend suites per §3."
  docs/adrs/:
    responsibility: "Architectural Decision Records. Created with the first structural PBI."

documentation_index:
  DOCS/Evidence-Research-OS-Technical-Spec-v1.md:
    answers: "What the system is: modes, roles, storage schemas, orchestration graph, API surface, UI pages, build phases."
  DOCS/Evidence-Research-OS-Implementation-Plan-v1.md:
    answers: "Build order, per-phase dependencies, and done-criteria. The sequencing input for asdlc-plan PBI slicing."
  DOCS/Evidence-Research-OS-Implementation-Guide-Phase0-1.md:
    answers: "Copy-adaptable code for scaffold, models, store, graph, agents, tools, API, UI. PBI implementation reference, not gospel."
  ARCHITECTURE.md:
    answers: "As-built snapshot of what exists (modules, boundaries, data flow, constraints). Changeable via ADR."
  plans/README.md:
    answers: "What is sequenced when (PBI order), Plane binding, and Todo-seed mapping."
```

## 6. Plane binding (single declared project — asdlc-plane scope)

- Workspace `kcb`, project `EVRSH` (Evidence Research OS,
  `d9629f4e-9f78-4ab1-b547-dd370bde0908`), MCP server `plane-kcb`.
- `asdlc-plan` / `asdlc-execute` sync strictly this project via `asdlc-plane`
  resolution (`PLANE_WORKSPACE`/`PLANE_PROJECT` env or these lines).
  `Backlog` state is ignored until moved to `Todo`.
