# Evidence Research OS — Feature Extraction from Analogs

Concrete, adoptable features only — not "these products exist," but "here's the specific mechanism, and here's where it plugs into what you've already spec'd." Grouped by category; each row says which existing doc/phase it amends.

---

## Functionality (net new capability)

| Feature | Borrowed from | What it does | Plugs into |
|---|---|---|---|
| **Elo tournament ranking** | Google Co-Scientist / `open-coscientist-agents` | Instead of a flat status per idea/hypothesis, run pairwise simulated debates between competing ideas and rank by Elo score | Phase 2 — replaces the flat kanban-only status model for Ideas with an optional ranking pass before promotion |
| **Meta-Reviewer role** | Co-Scientist's Meta-Review agent | A 6th role that critiques the *overall* report (coherence, gaps, whether the synthesis actually answers the question) — separate from Skeptic's per-claim adversarial review | New node between `synthesis` and `citation_audit`; add as a built-in role in Phase 5's registry |
| **Coverage-check ("unused evidence") pass** | Co-STORM's Moderator agent | Before finalizing, detect evidence units that were retrieved but never cited in any claim — surfaces wasted research and genuine gaps you'd otherwise miss | New node `coverage_check`, runs right before `synthesis`; writes findings as `tasks/*.yaml` if gaps are worth chasing |
| **Claim/Idea deduplication (not just Source dedup)** | Co-Scientist's Proximity agent | Your existing source-independence clustering (Phase 3 Task 32) only dedupes Sources. Extend the same embedding-clustering approach to Claims and Ideas — catches near-duplicate hypotheses the Ideator proposes across runs | Extends Phase 3 Task 32's `cluster_sources` — same function, applied to a second object type |
| **Closed-corpus / pinned-sources mode** | NotebookLM's fixed-notebook scoping | A run option: restrict Investigator to a manually-provided source list instead of open web search — for "verify my thesis against these 5 papers," not "go find sources" | New field on run-start payload: `pinned_sources: [S-001, S-004]`; when set, `search_web`/`search_academic` tools are disabled for that run |
| **Domain/quality search scoping** | Perplexity's Focus modes, Consensus's peer-reviewed-only filter | A toggle limiting Investigator's search to a specific tier — academic-only, peer-reviewed-only, or "allow grey literature" | New parameter on `search_web`/`search_academic` tools, surfaced in the methodology's Tools tab as a `Select`, not just enabled/disabled |
| **Perspective-guided planning** | STORM's persona-based question generation | The `plan` node generates sub-questions from multiple explicit angles (e.g., technical feasibility / market angle / contrarian skeptic) before Investigator starts — richer decomposition than single-pass planning, especially valuable given your CS+marketing+product+philosophy scope | Extends `plan` node (Phase 1 Task 7) — Scientist prompt gains an explicit "generate N perspectives" instruction |
| **Parallel targeted-research execution** | GPT-Researcher / `open_deep_research`'s parallel sub-question researchers | `targeted_research` currently processes `pending_tasks` one at a time (Phase 1 node stub, `for task in state["pending_tasks"]`). Run them concurrently instead — same pattern as `independent_first_pass` already uses | Direct code change to Phase 1 Task 7's `targeted_research` node — real performance win, not just a nice-to-have |

---

## Performance

| Change | Rationale (from analog research) | Where |
|---|---|---|
| **Fresh, full-content retrieval over shallow scraping** | Firecrawl's positioning explicitly contrasts "fresh full-content results" against "pre-digested summaries" — your `fetch_url`/`fetch_pdf` tools (Phase 1 Task 10) should prioritize a provider built for this over generic scraping | `app/tools/fetch.py` — consider Firecrawl or Exa as the underlying provider instead of raw `httpx`+`trafilatura`, at least as a configurable option |
| **Quality-over-volume as an explicit success metric** | 2026 benchmarking found Perplexity Sonar producing far more words/citations but *lower* factual accuracy than agents producing shorter output with fewer, more accurate citations | Add this as a literal metric in your Phase 4 "Final Quality Model" tracking — citations-per-claim and words-per-report are vanity metrics; citation-audit pass rate is the real one |
| **Concurrency in targeted research** | Same as the functionality row above — this is also a straightforward latency win, not just a capability one | `targeted_research` node |
| **Reuse checkpoints for debugging, don't add separate logging infra** | LangGraph's checkpointer (already in your Phase 1 stack) captures full state at every node transition — this is exactly what a "time-travel debugger" needs, for free | See UX row below — no new storage needed, just a UI on top of what SqliteSaver already persists |

---

## UX / Interface

| Feature | Borrowed from | Amends |
|---|---|---|
| **Consensus meter** | Consensus.app's visual % agree/disagree indicator | `ClaimConfidenceBar` (Frontend UX Spec §17) — add a visual split bar (supporting vs. opposing source count/weight) alongside the existing multidimensional confidence breakdown, not instead of it |
| **In-context source viewer with highlighted passage** | NotebookLM's citation badges linking to the exact highlighted passage in the source pane | `EvidenceTraceModal` (Frontend UX Spec §6) — currently shows `text_reference` as a plain string; upgrade to an embedded source viewer with the passage highlighted in place, when the source format allows it (HTML/PDF) |
| **Time-travel run debugging** | Langflow's visual debugging experience ("developers genuinely love it") | `RunActivityFeed` (Frontend UX Spec §9) — click any node-transition entry, see the full state snapshot at that checkpoint, not just the 1-line summary. Data already exists in the SqliteSaver checkpoints; this is a read-only viewer on top |
| **Ranked list view for Ideas, not just kanban** | Co-Scientist's tournament ranking | Ideas board (Frontend UX Spec §7) — add a "Ranked" view toggle alongside the kanban view, sorted by Elo score once the tournament pass (functionality row above) exists |
| **Structure editor before final synthesis** | Storyflow's "canvas where findings become a plan" | Output view (Frontend UX Spec §12) — optional manual reorder/select step: which claims go in which report section, before `synthesis` writes prose. Purely an ordering/inclusion UI, not a content editor |
| **Search-scope toggle exposed in run-start, not buried in settings** | Perplexity's Focus mode being one click away, not a settings page | Run-start dialog (Frontend UX Spec §5a) — add the domain/quality scoping toggle here directly, since it's a per-run decision, not a permanent methodology setting |

---

## What NOT to adopt (explicitly, so it doesn't creep in later)

- **NotebookLM's Audio Overview / multi-format output** — no evidence this serves your actual use case (evidence-backed decisions for KCB Labs), it's a consumer engagement feature for a different audience.
- **n8n's 400+ integration marketplace model** — wrong shape for a single-operator tool; your MCP-decoupled tool layer already gives you the same extensibility without needing a marketplace UI around it.
- **Voiceflow/Dify's app-publishing/multi-tenant layer** — explicitly out of scope per your original non-goals (spec §1, "not multi-tenant, not sold").

---

## Suggested integration order

Cheapest-first, since none of these block each other:
1. Parallel targeted-research (pure code change, real perf win, no new UI)
2. Consensus meter + search-scope toggle (small UI additions to existing views)
3. Coverage-check node + Meta-Reviewer role (new nodes, Phase 1/4 graph additions)
4. Claim/Idea dedup extension (reuses Phase 3 clustering code)
5. Tournament ranking + ranked Ideas view (bigger — new scoring mechanism + new UI mode)
6. Time-travel debugging (nice-to-have, do when you actually need to debug a confusing run, not preemptively)
7. Closed-corpus mode + perspective-guided planning (change how Investigator/Scientist behave — test these against a real Lab Project before committing)
