# Evidence Research OS — Implementation Plan

Companion to `Evidence-Research-OS-Technical-Spec-v1.md`. Each phase lists tasks in build order, dependencies, and what "done" means. Don't start a phase's UI work before its backend tasks are done — the API is the only thing the frontend is allowed to depend on (spec §8/9).

---

## Phase 0 — Scaffold (prerequisite for everything)

1. Repo structure: `backend/` (FastAPI), `frontend/` (Next.js 15), `lab-projects/` (data volume, gitignored from the app repo, backed up separately)
2. Coolify project: two services (backend, frontend) + persistent volume mount for `lab-projects/`
3. `project.yaml` reader/writer utility + Pydantic models for all object types (Source, Claim, Evidence, Contradiction, Experiment, Decision, Task, Idea) — spec §4.2
4. Filesystem CRUD helpers: create/read/update object YAML by ID, list-by-type, never hand-edit outside these helpers (keeps schema drift out)
5. Git init per Lab Project on creation; commit on every write (this is your audit trail — don't skip it to save time)

**Done when:** you can create a Lab Project directory by hand, and the Pydantic models round-trip every YAML file without loss.

---

## Phase 1 — MVP: Deep Research mode only

Dependencies: Phase 0 complete.

### 1a. Orchestration
6. `LabProjectState` TypedDict (spec §6.1) + SQLite checkpointer wired per Lab Project
7. LangGraph nodes, in this order, each one runnable in isolation before wiring the full graph:
   - `TRIGGER_CLASSIFIER` (cheap single-pass, decides escalate-or-not)
   - `PLAN` (Research Director → `plan/research-plan.yaml`)
   - `INDEPENDENT_FIRST_PASS` (Scientist, Investigator, Skeptic — parallel, fresh context each)
   - `EVIDENCE_EXTRACTION`
   - `CONFLICT_DETECTION`
   - `TARGETED_RESEARCH` (loop-back branch)
   - `ADVERSARIAL_REVIEW`
   - `EVIDENCE_ADJUDICATION` (judge model — must differ from council models, enforce at graph-start validation)
   - `SYNTHESIS`
   - `CITATION_AUDIT` — **basic version**: existence check only, defer pincite/support-match to Phase 3
   - `TARGETED_REPAIR` (loop-back on audit FAIL)
   - `HUMAN_CHECKPOINT` (blocks graph, waits for API approval call)
   - `FINAL_OUTPUT`
8. Budget controller: `max_model_calls`, `max_research_rounds` enforced as hard stops, read from `project.yaml`

### 1b. Agents & tools
9. Scientist / Investigator / Skeptic / Judge prompts, OpenRouter model config in `project.yaml`, validation rule blocking judge==council overlap
10. MCP tools: `search_web`, `fetch_url`, `fetch_pdf`, `extract_pdf`, `grep_project` (ripgrep wrapper, iterative narrow-then-read — not single-shot), `store_source`, `retrieve_evidence`
11. `tool_outputs/<session_id>/` cache: check-before-fetch keyed on URL/DOI hash

### 1c. Backend API
12. `POST/GET /lab-projects`, `GET /lab-projects/{id}`
13. `POST /lab-projects/{id}/runs`, `GET .../runs/{run_id}`, `GET .../runs/{run_id}/stream` (SSE)
14. `POST .../runs/{run_id}/approve`
15. `GET .../claims`, `GET .../claims/{claim_id}` — backed by a regenerated SQLite view over `claims/*.yaml` (not hand-maintained)
16. `GET .../decisions`, `GET .../budget`, `GET .../output/report`

### 1d. Control panel UI
17. Dashboard (`/`) — Lab Project list, "New Lab Project"
18. Lab Project overview (`/lab/[id]`) — question, budget gauge, tabs (Claims / Runs / Output only for MVP — Ideas/Graph/Audit come later)
19. Claims table with filter (status, confidence) — `EvidenceTraceModal` component (claim → evidence → source, one click)
20. Run view — `RunActivityFeed` via SSE, `BudgetGauge`, checkpoint-approval modal

**Done when:** you run one real question from an existing `/areas/` topic end-to-end — plan → council → adjudication → synthesis → basic citation check → human approval → report.md — and can trace every claim in the output back to a source through the UI, no manual filesystem inspection needed.

---

## Phase 2 — Brainstorm mode

Dependencies: Phase 1 done and validated on a real topic.

21. `Idea` schema (spec §4.2) + `ideas/` directory
22. `Ideator/Explorer` agent — prompt modeled on Co-Scientist's Generation+Evolution pattern
23. `NOVELTY_CHECK` node (replaces `CONFLICT_DETECTION` in Brainstorm mode) — checks new ideas against existing `ideas/*.yaml` for duplication/adjacency
24. Skeptic rubric switch: mode-conditional prompt (citation-adversarial vs. novelty/experiment-design-adversarial)
25. `mode` field wired through: `project.yaml`, LangGraph state, API run-start payload, UI mode toggle
26. API: `GET /lab-projects/{id}/ideas`
27. UI: Ideas board (`/lab/[id]/ideas`) — kanban by status (proposed → under_skeptic_review → promoted/rejected)

**Done when:** a Brainstorm run produces at least one idea with a stated falsification condition, survives Skeptic review, and can be manually promoted to a `Claim` for a follow-up Deep Research run on the same Lab Project.

---

## Phase 3 — Full citation audit + retrieval indices

Dependencies: Phase 1 (citation audit basic version exists to extend).

28. `citation_verify` tool, 3-stage: metadata/existence → pincite/location check → support-match (does the source actually say what's claimed — the SourceCheckup failure mode)
29. Extend `CITATION_AUDIT` node to run all 3 stages, PASS/WARNING/FAIL per stage not just overall
30. Tantivy index: build/rebuild job over all Lab Project YAML/MD, `keyword_search` MCP tool
31. LanceDB integration: `fastembed` local embeddings, `semantic_search` tool
32. Source-independence clustering job (spec §20/§4.2) — populates `independence_cluster` field on `Source` objects, run as a background job not inline in the graph (keep it off the critical path)
33. API: `GET /lab-projects/{id}/audits/latest`
34. UI: Audit page (`/lab/[id]/audit`) — per-claim, per-stage PASS/WARN/FAIL, drill-in on failure reason

**Done when:** a claim whose source is topically relevant but doesn't actually support the specific statement gets flagged FAIL at the support-match stage, not silently passed because the citation "exists."

---

## Phase 4 — Cross-project search, Academic tier, product handoff

Dependencies: Phase 3 (needs LanceDB in place for cross-project search).

35. Cross-Lab-Project semantic search — same LanceDB instance, filterable by project
36. Academic/Publication mode: methodology-analysis node, reproducibility-audit node (only invoked when mode is escalated — not default)
37. `product/` notes: `POST /lab-projects/{id}/product-notes`, UI "promote to product" action on the Output page
38. `labs.kcb.ma` handoff — whatever the actual publish mechanism ends up being on that side (check `kcb-labs` spec before building this — don't duplicate the Keystatic CMS logic here)

**Done when:** a Lab Project's output can be pushed toward `labs.kcb.ma` without manual copy-paste, and a cross-project query ("what have I already concluded about X across all Lab Projects") returns something useful.

---

## Sequencing notes

- Don't build Tantivy/LanceDB before Phase 3 — MVP runs on ripgrep alone deliberately, per spec §12. Adding retrieval infra before you have real Lab Project content to search against is premature.
- The judge-model-exclusion validation (task 9) is a hard rule, not a nice-to-have — wire it as a startup check that refuses to start a run with overlapping models, don't rely on remembering to configure it correctly.
- Git-commit-per-write (task 5) is cheap now and expensive to retrofit — do it in Phase 0, not later.
