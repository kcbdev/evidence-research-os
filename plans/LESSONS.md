# LESSONS.md — Evidence Research OS (chain PBI-034–061, 2026-09-10/11)

Persisted only after human approval. Each entry: what happened, what to do.

## 1. Never emit no-op edits
Identical old/new strings make the edit tool eat a newline (5 incidents:
build.py, test files, api.ts). Rule: every edit must change bytes; verify
with read-back or import check immediately after risky edits.

## 2. Combined shell commands commit regardless
`cmd1; git commit` runs the commit even when tests fail. Order: gate
first, commit only on green — never chain them with `;`.

## 3. Start-Process arg arrays split on spaces
`-k "a or b"` arrives as three args (`file not found: or`). Single-token
filters only, or run whole files.

## 4. PowerShell has no heredoc/grep/head/tail, and bracket paths break cmdlets
Use write-file scripts + `uv run python <file>`; prefer the dedicated
Grep/Read tools over shell text processing.

## 5. Interactive debugging is unavailable — design tests that print state
Debug via throwaway scripts (run, read log, delete) or assertion-rich
reruns. Never `--pdb`, never watch-mode.

## 6. Hermeticity needs a guard, not discipline
The conftest autouse no-download fixture (fail loud on embedder reach)
caught a real gap the same day. Any suite touching heavy deps (models,
network, native libs) gets an equivalent guard at introduction time.

## 7. The segfault is environmental — rerun protocol holds
Windows access-violation in idle ThreadPoolExecutor workers, wandering
site, halves green on rerun. Split halves + detached runs + log
inspection; never chase it as a code bug without a stable repro.

## 8. Batch reviews catch what gates can't
Biggest finds (lost loop-backs, firewall bypass, rotation bypass,
unproven 400-matrices) all came from adversarial re-reads, not test
failures. Keep deterministic gates per PBI, adversarial review per
batch at minimum.

## 9. Spec-vs-DOCS conflicts resolve once, centrally
Frozen as-built contracts (SSE names, ID scheme, sync rerun) recorded
in the Phase-4 spec Decisions — every later PBI cited it instead of
re-litigating. Do this for every deliberate DOCS deviation.

## 10. Edit tool success messages lie occasionally
Several edits reported success without applying (or applied wrongly).
Trust read-back and gate output, never the confirmation string.
