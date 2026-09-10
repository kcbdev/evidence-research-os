# Spec: phase-3-audit-retrieval

## Goal

Citations become actually verified and retrieval grows past ripgrep:
a 3-stage audit (existence → pincite → support-match) with per-stage
results a human can inspect; a global settings fallback (models incl. a
non-rotating auditor role, budget defaults); Tier-2 BM25 and Tier-3
vector indices with honest rebuild discipline; source-independence
clustering written back without touching the hot path; an explicit
same-run retry that honors the no-silent-resume rule; and the read-only
evidence-graph surface plus claims-filter alignment.

## Scope

- In scope: `GET/PUT /settings/models` (roles scientist/investigator/
  skeptic/judge/ideator/auditor) + `GET/PUT /settings/budget`;
  `citation_verify` tool (3 stages) + audit node rewrite + `audits/*.yaml`
  results store; audits API (`latest` + rerun) + audit UI page; Tantivy
  keyword index + investigator wiring; per-project LanceDB/fastembed
  semantic index + wiring; dedup clustering as post-run hook writing
  `Source.independence_cluster`; `POST retry` (same run_id, checkpoint
  resume, covers failed AND interrupted explicitly); graph endpoint +
  explorer UI; claims-list filter alignment with the API Reference
  (multi-status, `contradictions_only`).
- Out of scope: cross-project search (Phase 4); visual graph editing;
  async audit jobs; any change to the SSE/event contract.

## Contracts (success criteria)

- A claim citing a real, reachable source that does not say what is
  claimed fails specifically at `support_match`, distinct from a broken
  link failing at `existence` (the Phase-3 done probe — real, not faked).
- Audit results persist per (claim, evidence, stage) with the reasoning
  `detail` string; the UI shows which stage failed and links back to the
  claim trace.
- Settings validate like run-start: judge overlap → 422, auditor model
  outside the council/judge rotation (enforced, not conventional).
- Keyword and semantic search return the seeded document for an obvious
  query in tests (fixture-built indices, no network, no model download —
  embedding calls are seam-mocked; the ONNX model loads only live).
- Retry on a failed/interrupted run resumes its own thread checkpoint
  under the same run_id (run==thread contract kept); 400 otherwise.
- Graph endpoint returns claim/source/evidence nodes + supports/
  contradicts/references edges with an optional status filter; the
  explorer is read-only (zoom/pan, side-panel detail, no edit affordance).

## Anti-patterns

- No index rebuild inline on every store write (mtime-checked lazy
  rebuild, same discipline as the claims.db view — never an invalidation
  protocol to get wrong).
- No dedup/clustering inside the research graph's critical path (post-run
  hook only); never inline.
- No faked audit results to unblock UI work (cumulative-validation rule:
  an unmeetable done-condition means unfinished, not relaxed).
- No new pause mechanism for audit reruns; no SSE changes.

## Decisions

- Audit rerun is synchronous (deviation from the API Reference's 202 —
  single-operator scale, runs complete in seconds; documented here, not
  silently diverged). The endpoint still scopes to one claim or global.
- `AUDITOR_MODEL` resolves settings-fallback → env → 422-missing at
  audit time; support-match degrades to WARNING-with-reason, never a
  silent PASS, when no auditor model is configured.
- runs.db gains columns (`started_at`, `mode`, `duration_s`) via an
  `ensure-columns` helper — `CREATE TABLE IF NOT EXISTS` alone cannot
  migrate PBI-029 databases, and wiping user history is unacceptable.
- SSE names, ID scheme, and pagination stay as-built (frozen contract —
  see phase-4 spec Decisions for the full ruling; this phase changes none
  of them).
- New pip deps (tantivy, lancedb, fastembed, numpy) install in their
  consumer PBIs on approval; Windows-wheel + first-run model-download
  risk is flagged in the plan report, not discovered at merge time.

## Tooling (optional)

- Same deterministic gates; consumer PBIs record the new deps in
  `plans/README.md` Tooling on landing.
