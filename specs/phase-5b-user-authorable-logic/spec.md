# Spec: phase-5b-user-authorable-logic

## Goal

New methodology ideas stop requiring engine code changes: Tier A covers
new agent roles as prompt+tools YAML executed by one generic node;
Tier B covers one-off branching as sandboxed `simpleeval` expressions;
Tier C covers real algorithms as single dropped-in Python files under
explicit single-operator trust. The compiler's job is unchanged across
tiers — only how much of a methodology is authorable without touching
the engine grows.

## Scope

- In scope: `make_prompt_agent_node` generic executor
  (`app/graph/generic_node.py`) + `custom_roles` schema + compiler
  custom-first resolution + a `tools/dispatch.py` name→tool registry for
  the existing tools; `make_expr_condition` (`app/graph/expr_condition.py`,
  simpleeval) + `loop_condition` schema + compiler branch (coexists with
  `loop_while`); `custom_nodes/` discovery (`NODE_ID` + `run(state)`,
  merged at build time) + guardrail conventions; witness PBI authoring
  one Tier A/B methodology and one Tier C node against a real project.
- Out of scope: WASM/container sandboxing for Tier C (explicitly deferred
  until a second human author exists); visual builder; Tier C hot-reload
  (process restart picks up new files — acceptable, documented).

## Contracts (success criteria)

- A Tier A-only methodology (custom role, no new code) runs end to end:
  the custom stage appears in the run event log and writes results the
  evidence graph can show.
- A `loop_condition` expression alters branching on a real run
  (expression true → loop taken; false → falls through), with registry
  conditions still working alongside.
- A Tier C file defining `NODE_ID` + `run(state)` is discovered at build
  time and executes in a methodology that names it; a malformed file
  fails graph-build loudly with filename + reason (never silently
  skipped).
- Budget controller and tool-output cache behave identically for
  custom stages as for built-ins (asserted: custom model calls consume
  budget; custom fetches hit the cache keyed by URL/DOI hash).
- Done-condition (manual witness): both methodologies run against a real
  Lab Project with the parity checks above confirmed.

## Anti-patterns

- No Tier B/C syntax accepted before this phase (Phase 5 schema rejects
  it — the witness PBI proves the rejection is gone here, not earlier).
- No custom-node bypass of the tool layer (fetch via `cached_fetch`/
  `fetch_url`, never direct HTTP — `# TOOL-LAYER:` comment convention so
  violations are greppable; enforced by review, not runtime).
- No Tier C exemption from budgets (custom nodes read/write
  `state["budget"]` like built-ins).
- No sandboxing theater: Tier C is documented-trusted (single operator,
  git-revertable), NOT sandboxed — claiming otherwise would be the lie
  the guide warns against.

## Decisions

- `simpleeval` is the expression evaluator (no imports, no dunders, no
  arbitrary calls) — safe even if the single-operator assumption later
  loosens, unlike Tier C.
- Compiler resolution order: `custom_roles` id → Tier C discovered →
  built-in `NODE_REGISTRY` (custom names may shadow built-ins; shadowing
  logs a warning naming both — explicit, never silent).
- `output_schema` on a custom role is a best-effort validation hint, not
  a second type system (keep the string-path form from the guide).
- Tier C files live in repo `custom_nodes/` (git-tracked, revertable);
  not per-project (per-project code loading is a distribution problem
  for a later phase, if ever).

## Tooling (optional)

- New pip dep: `simpleeval` (pure Python, no wheel risk). Same gates.
