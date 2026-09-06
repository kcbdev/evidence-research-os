# ADR-0001: Run artifacts live outside the store (and mostly outside git)

Date: 2026-09-05 (PBI-014). Status: accepted.

## Context

AGENTS.md §4 says "all Lab Project writes go through the store helpers",
and the store module calls itself "the ONLY writer of Lab Project object
YAML". But the graph also produces `plan/research-plan.yaml`,
`debates/*.md` transcripts, `tool_outputs/<session>/` cache files,
`output/report.md` + `references.md`, per-project `checkpoint.sqlite`,
and the derived `.index/` — none of which are evidence object types.

## Decision

- The store owns **object YAML only** (sources, claims, ideas, evidence,
  tasks, decisions, project.yaml). Everything else is a **run artifact**,
  written directly by the node that produces it.
- Git treatment: `output/` (deliverables) and `audits/` are TRACKED;
  `plan/`, `debates/`, `tool_outputs/`, `.index/`, `checkpoint.sqlite`
  are UNTRACKED via a project-level `.gitignore` written by
  `LabProjectStore._ensure_layout` and piggybacked onto the first
  object-write commit (creation itself — bare `__init__` with no writes
  — still mints zero commits; the API create path writes meta
  immediately, so its first commit is `meta + .gitignore`).
- Interim lifecycle gap (owned by the promote-to-product flow,
  Phase 4): NOTHING commits `output/`/`audits/` yet — nodes write them
  directly and no PBI wires a commit. They sit dirty until then; the
  operator commits manually before any handoff. PBI-019 validation
  reads them from disk, so e2e is unaffected.
- Durability of human judgment does NOT rely on versioning the
  artifacts: scope approvals (`/approve`) and terminal run outcomes are
  recorded as `decisions/` objects through the store (audit trail
  intact), even though the artifacts they judge are untracked.

## Consequences

- `git status` in a Lab Project shows object + deliverable changes only.
- Cache/checkpoint loss is recoverable (refetch / re-run), by design.
- Any NEW artifact kind must state its track/untrack treatment here
  before it is written.
