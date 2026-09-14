# Evidence Research OS — Outcome Contract v1

## 0. What this document is

Not a spec, not a build guide. A **verification instrument**, used once the phases are built — including Phase 6 — to check the system against its own stated intent, not just against each phase's local "done when" line. Every phase guide already has a done-condition; those verify each phase in isolation. This document verifies things that only show up **across** phases: a default methodology that silently doesn't match what got built, a judge-exclusion rule that works in one place but not another, a UI badge that can show green while the underlying audit says FAIL. Passing every phase's own checklist does not guarantee this document passes — that gap is exactly what this exists to catch.

Each clause below has a stated verification method. A clause without a way to check it isn't a real clause — don't add to this document unless you can also say how to test it.

---

## 1. Functional outcome contract

| Outcome | Verification |
|---|---|
| Research mode produces an evidence-graph-backed report, every claim traceable to source with adjudication reasoning | Run against a real `/areas/` topic; open any claim in the Claims table, confirm the full chain (claim → evidence → source → original location) resolves and the adjudication reasoning is present, not just a status label |
| Brainstorm mode produces ideas with stated falsification conditions that survive Skeptic review and can be promoted | Run Brainstorm on the same topic; promote one idea; confirm it becomes a real `Claim` object and is runnable through a normal Research-mode pass |
| Citation audit distinguishes existence / pincite / support-match as genuinely separate failure modes | Manually construct one claim of each failure type (dead link; wrong page; real quote that doesn't support the claim); confirm each is flagged at its correct stage, none conflated into a generic FAIL |
| Methodology registry's default is the *actual* captured Phase 1-4 pipeline, not a stub | Open `methodologies/deep-research-council-v1.yaml`, confirm the `models` field is filled with real model IDs — **the Phase 5 migration script (Task 42) ships this field empty on purpose as a placeholder; check it was actually completed, this is the single most likely "looks done, isn't" gap in the whole build** |
| At least 3 methodologies (research/brainstorm/academic) exist and are independently selectable per run | Start two runs with different `methodology_id`s on the same Lab Project; use the time-travel checkpoint viewer (Phase 6 Task 56) to confirm genuinely different node sequences executed, not the same graph with cosmetic differences |
| A methodology built entirely through the No-Code Builder (zero hand-written YAML) compiles and runs | Build one from scratch in the UI; run it; confirm no manual YAML editing was needed at any point |
| Tier A/B/C authoring (Phase 5b) all function | One custom role (Tier A), one inline expression condition (Tier B), one dropped-in custom node (Tier C) — each exercised in a real run, not just unit-tested in isolation |
| Phase 6 additions work individually and don't regress earlier phases | Run Phase 6's own cumulative validation table (7 rows), **then re-run Phases 1-5's done-conditions afterward** — Phase 6 touching shared nodes (`targeted_research`, the planning prompt) is exactly the kind of change that can quietly break something Phase 1 already validated |

---

## 2. Performance outcome contract

| Outcome | Verification |
|---|---|
| Budget controller hard-stops cleanly, across every node type including Phase 6 additions | Set `max_model_calls` artificially low (e.g. 3); confirm the run stops with a clean status, not an unhandled error — test this against a run that includes Meta-Reviewer and tournament ranking specifically, not just the original Phase 1 node set |
| Parallel targeted research doesn't scale linearly with task count | Time a run with 1 open contradiction vs. one with 4; confirm the 4-task run doesn't take ~4x as long |
| Retrieval tiers are used as designed, no tool bypasses the cache | Grep the codebase for any `fetch_url`/`fetch_pdf` call that doesn't go through `cached_fetch` — there should be none |
| Filesystem remains the actual source of truth | Delete every `.index/` directory (Tantivy, LanceDB) for a Lab Project and rebuild from the YAML; confirm identical query results before/after — if results differ, something has silently become dependent on the index rather than treating it as derived |

---

## 3. UX/Interface outcome contract

| Outcome | Verification |
|---|---|
| Every claim is traceable to source in ≤2 clicks from the Claims table | Manual click-through count on 3 random claims |
| `StatusBadge` color mapping is identical across Claims, Ideas, and Audit views | Visual side-by-side check — Frontend UX Spec §17 explicitly calls out this consistency as load-bearing for the trust signal, don't let it drift per-view |
| Consensus meter, confidence bar, and audit badges never contradict each other for the same claim | Find a claim with a support-match `WARNING` or `FAIL`; confirm its status badge is not simultaneously showing `SUPPORTED` — a claim failing citation audit displaying as trustworthy is a coherence failure, not a cosmetic one |
| No dead UI: nav items for unbuilt phases don't render | Confirm `/search` and Methodology-builder nav entries are absent (not greyed-out placeholders) in an environment where Phase 4/5 haven't been reached |

---

## 4. Coherence outcome contract (the cross-cutting checks)

| Outcome | Verification |
|---|---|
| Judge-exclusion validation actually blocks a run, not just passes a unit test | Deliberately configure judge model == a council model; attempt to start a run via the real API; confirm it refuses at run-start, not silently proceeds |
| Judge-exclusion extends to the Meta-Reviewer role (Phase 6 Task 51 note) | Same test, with Meta-Reviewer's model set to overlap a council model — confirm this is *also* caught, since it's easy to add a new role and forget to extend the existing validation to it |
| A methodology built visually and one hand-written in YAML compile to the same graph for the same logical workflow | Build the default methodology both ways; diff the compiled `StateGraph` structure (or the resulting node/edge list) — should match |
| Every adjudication produces a Decision entry — no silent adjudication | Count adjudicated claims vs. `decisions/*.yaml` entries referencing them; should match 1:1, not have adjudications with no corresponding decision record |
| The evidence graph is git-history-legible | Pick one real `DISPUTED` or `CONTRADICTED` claim; reconstruct why it reached that status using only `git log` on the Lab Project directory — if this requires guessing or external memory, the commit-per-write discipline (Phase 0 Task 5) has gaps |
| Custom (Tier C) nodes respect the budget controller and tool cache | A custom node that calls a model increments `calls_used`; a custom node that fetches a URL hits the same `tool_outputs/` cache as built-in nodes — verify by code inspection, not just by it "seeming to work" |

---

## 5. Non-goal contract (verifying restraint, not capability)

| Non-goal (stated in vision doc / spec §1) | Verification it wasn't violated |
|---|---|
| No auth/billing surface | No such routes, middleware, or UI exist |
| Not multi-tenant | Nothing in the data model keys a Lab Project or its contents by user ID |
| Tools registry has no "add tool" UI (No-Code Builder §8's explicit boundary) | Confirm the Tools page is read-only, header text states why |
| Custom-code (Tier C) authoring has no sandboxing | Confirm this is still true and still justified — i.e., still single-operator. If a second author has been added since Phase 5b, this row should now be **failing**, and that's correct — it means the WASM/container sandboxing flagged as a future item is now overdue, not that the contract is wrong |

---

## 6. Single end-to-end acceptance scenario

If this scenario completes without manual intervention beyond the designed human checkpoints, treat it as strong composite evidence the contract holds:

1. Pick a real `/areas/` topic as the Lab Project.
2. Start a Brainstorm run using a methodology with one Tier A custom role.
3. An idea survives Skeptic review and tournament ranking; promote it to a Claim.
4. Start a Research-mode run on that claim, using a methodology **built entirely in the No-Code Builder**.
5. `coverage_check` surfaces at least one unused-evidence gap.
6. `targeted_research` resolves it via parallel task execution.
7. Meta-Reviewer flags a coherence issue on the first synthesis draft; the graph loops back.
8. Citation audit passes all 3 stages on the revised draft.
9. Human approval at the checkpoint.
10. Output is generated; promote to product with a linked `/areas/` slug.
11. From a *different* Lab Project, cross-project search finds this claim.

Every phase (1 through 6, including the No-Code Builder) is exercised at least once in this single walkthrough. If any step requires a workaround, hand-edit, or "actually let me just fix this manually," that step's underlying phase isn't done regardless of what its own checklist says.

---

## 7. The difference between "complete" and "coherent" — why both checklists exist

A phase can pass its own done-condition and still fail this contract. The concrete failure mode worth remembering: Phase 5's migration script left `models: {}` as an explicit placeholder comment ("fill from your actual current project.yaml"). If that never gets filled in, every Phase 5 task still technically executes — the file exists, `is_default` is true, the API returns it — but the *outcome* (a working default methodology) never actually landed. Completeness is "did each task run." Coherence is "does the system, taken as a whole, do what section 1-6 of the vision doc said it would." This document exists because the second one doesn't fall out automatically from the first.
