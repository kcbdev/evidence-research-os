# Spec: phase-2-brainstorm

## Goal

Brainstorm mode becomes a real second pipeline through the same engine:
an Ideator proposes falsifiable ideas, the Skeptic reviews them against a
brainstorm rubric (not a citation rubric), novelty is checked against
existing ideas, and a human manually promotes a surviving idea to a claim
— after which a normal research run takes over. The ideas board UI is the
divergent-exploration surface; promotion is the bridge back to research.

## Scope

- In scope: ideator agent + prompt; `novelty_check` node; mode-conditional
  Skeptic rubric; mode-conditional graph wiring (`build_graph` branches on
  `mode`); `mode` validation on run start; ideas API
  (`GET` list/filter, `PATCH` status incl. promote→claim); ideas board UI
  (kanban + detail panel + promote flow offering an immediate research run).
- Out of scope: embeddings for novelty (Skeptic-model judgment only, per
  guide — LanceDB similarity waits for Phase 3 scale); automatic promotion;
  academic mode (Phase 4); methodology selection (Phase 5 — brainstorm runs
  use the hardcoded branch until the compiler lands).

## Contracts (success criteria)

- A brainstorm run writes `Idea` objects with `statement`,
  `proposed_experiment.falsification_condition`, and `novelty_check`
  (`novel`/`adjacent`/`duplicate` + `against` ids).
- The same run never writes claims/evidence (divergence only); Skeptic
  output references novelty and falsifiability, never citations.
- `POST /runs` with an unknown `mode` returns 422; `research` runs are
  byte-identical in behavior to Phase 1 (no regression — existing gates).
- `PATCH /ideas/{id}` to `promoted_to_claim` creates a `Claim` referencing
  the idea and returns `created_claim_id`; to `rejected` parks it.
- Done-condition (manual witness): an idea survives Skeptic review with a
  stated falsification condition, promotes via UI click, and a research
  run starts on the project afterwards.

## Anti-patterns

- No `conflict_detection`/`evidence_extraction` in brainstorm runs (wrong
  rubric for the job); no citation language in brainstorm prompts.
- No auto-promotion of any kind — promotion is a human click, always.
- No dragging brainstorm-only fields into the research path (idea refs on
  claims are a link, not a lifecycle).

## Decisions

- As-built head start (verified 2026-09-10): `Idea`/`NoveltyCheck`/
  `ProposedExperiment` models, `store.write_idea/list_ideas`, and the
  `ideas/` layout dir already exist — the old guide Task 21 is done and is
  NOT re-planned. PBIs start at the ideator.
- `ideator` joins `council_models` as a fourth key and is covered by the
  existing judge-exclusion check (it shapes first-pass content like any
  council role; `validate_model_assignment` applies unchanged).
- `ProjectMeta.mode` / `LabProjectState.mode` literals already include
  `brainstorm`; only `build_graph` ignores the field today — the PBI fixes
  the wiring, not the schema.
- API shape follows the API Reference (`PATCH` status transitions, not a
  separate promote endpoint) so the Phase 5 methodology capture inherits a
  stable surface.

## Tooling (optional)

- None new. Deterministic gates per `plans/README.md` (backend halves
  split, frontend typecheck/test).
