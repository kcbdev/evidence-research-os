# Spec: model-selector

## Goal

Nobody types OpenRouter model IDs from memory on the new-lab flow:
every role field is a searchable selector populated from the live
OpenRouter model list, prefilled with a known-good default set, with
honest degradation (free-text fallback + cached list) when the network
or the API fails.

## Scope

- In scope: OpenRouter `/models` fetch client (cached 24h, refresh),
  `ModelSelector` combobox (substring filter, keyboard operable, shows
  name + id), `/lab/new` adoption (5 roles, predefined defaults),
  tests.
- Out of scope: Overview settings tab (follow-up PBI — same component
  drops in), server-side proxy (direct browser fetch; `/models` needs
  no key), pricing/context-length display (ids + names only for v1).

## Contracts (success criteria)

- /lab/new renders 5 selectors prefilled with the default set; picking
  from the dropdown fills the OpenRouter id; create posts ids.
- Selector filters a 300+ model list by substring as you type;
  Enter/click selects; Escape closes; fully keyboard operable.
- OpenRouter down → fields still accept typed ids (never stranded);
  stale cache (24h) used when offline, refresh button refetches.
- Unknown-to-list ids are submittable (valid custom/future ids).

## Anti-patterns

- No blocking the form on the models fetch (fields usable instantly).
- No invented model ids in the list (list = live API only).
- No `dark:` overrides; semantic tokens; 44px targets.

## Decisions

- Defaults = witnessed working set (deepseek flash ×3 incl. ideator,
  qwen investigator, llama-3.3-70b judge) — real, ran in prod witness
  lineage; user changes via selector.
- Direct browser fetch (no backend proxy — keyless endpoint).
