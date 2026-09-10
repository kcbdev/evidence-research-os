# Spec: phase-5-methodology-registry

## Goal

The three hardcoded pipelines (research, brainstorm, academic) become
saved, selectable, swappable data: a node/condition registry, a
`Methodology` schema, a graph compiler, a one-time capture of the
current implementation as the default methodology, a YAML store + API,
run-start selection with explicit model/budget precedence, and the
methodology management UI (list, YAML editor, set-default). After this
phase the methodology file IS the pipeline definition — the hardcoded
`build_graph` is deleted.

## Scope

- In scope: `NODE_REGISTRY` + `CONDITION_REGISTRY`
  (`app/graph/registry.py`); `Methodology`/`StageSpec` schema
  (`app/models/methodology.py`); `build_graph_from_methodology`
  (`app/graph/compile.py`); one-time capture script + three methodology
  YAMLs (research default, brainstorm, academic); hardcoded-builder
  deletion + run-start cutover; methodology store + CRUD API
  (`GET/POST /methodologies`, `GET /methodologies/{id}`,
  `POST …/set-default`); `methodology_id` on run-start and project
  create; methodology dropdowns (run-start dialog, new-lab flow);
  `/settings/methodologies` list + YAML editor + compiled-stage preview.
- Out of scope: user-authorable logic tiers (Phase 5b); visual workflow
  builder (YAML editor is the v1 surface, per UX spec); methodology
  versioning/history beyond git.

## Contracts (success criteria)

- At least 3 methodologies listable (captured research/brainstorm/
  academic); starting a run with an explicit non-default methodology
  changes which nodes execute (asserted on the run event log, not on
  config echoes).
- `set-default` changes which methodology an unspecified run uses.
- Unknown node/condition names fail at save/compile time with the
  offending field named (422 on the API, never a half-built graph).
- Judge/council overlap in a methodology's models fails the same
  fail-closed check as run-start.
- Capture parity: the captured default methodology reproduces the exact
  Phase 1–4 node order, edges, loop-backs, budget short-circuits, and
  single `human_checkpoint` interrupt (diff-reviewed, then the old
  builder is deleted — no two pipeline definitions coexist).
- Methodology files author safely: stages reference registry names only,
  no code execution surface in YAML (the boundary Phase 5b explicitly
  revisits — this spec does not preempt it).

## Anti-patterns

- No general graph language (no arbitrary code, expressions, or imports
  in methodology YAML — Tier B/C syntax is rejected as unknown fields
  until Phase 5b lands).
- No dual pipeline definitions after cutover (capture-then-delete is one
  PBI, never two — a lingering `build_graph` next to the compiler is a
  fork, not a migration).
- No implicit model/budget precedence: run uses methodology
  models/budget unless the Lab Project explicitly overrides — documented
  in the run-start response path, not tribal knowledge.
- No methodology cache staleness: the graph cache keys on
  (project, methodology_id, methodology mtime/content-hash) — the
  as-built key (project only) would serve a stale pipeline after a YAML
  edit, which is exactly the confusing-bug class the guide warns about.

## Decisions

- Registry entries point at the existing `make_*(project_path)` builder
  factories, not bare node functions (adapts the guide sketch to the
  as-built factory pattern — compiler calls `builder(path)` at
  build time; zero-arg nodes like `human_checkpoint` register directly).
- `custom_roles` / `loop_condition` keys are rejected by schema
  validation until Phase 5b (fail-closed against forward-authoring).
- `PUT /methodologies/{id}` (full update, per API Reference) ships in
  the store/API PBI — the guide's sketch omits it but the reference
  requires it; same validation as POST.
- Run records and `runs.db` carry `methodology_id` (schema-evolution
  helper from Phase 3 extends to the new column); history shows which
  methodology each run used.
- Methodology YAML editor is raw YAML + validate-on-save against the
  Pydantic schema with inline errors; the compiled-stage preview is a
  read-only vertical stage list (no builder — unjustified scope until
  several methodologies are hand-authored).

## Tooling (optional)

- Same deterministic gates. No new dependencies (PyYAML already present).
