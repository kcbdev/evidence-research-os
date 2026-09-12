# Spec: nocode-methodology-builder

## Goal

The methodology YAML editor (`/settings/methodologies/[id]`, PBI-057)
becomes a no-code visual builder: four reusable libraries (Skills,
Prompts, Custom Roles, Tools registry) authored once and referenced
from many methodologies, composed on a React Flow canvas into a
workflow that compiles to the exact methodology YAML the Phase 5/5b
compiler already accepts. After this spec lands, hand-editing YAML is
the escape hatch (Export/Import), not the primary surface.

## Scope

- In scope:
  - Backend library APIs: Skills CRUD, Prompts CRUD + version history,
    Custom Roles library CRUD, read-only Tools registry, `GET
    /methodologies/condition-fields` reference data, `POST
    /methodologies/{id}/validate` (validation without saving).
  - Frontend library pages: `/settings/skills`, `/settings/prompts`,
    `/settings/roles` (CRUD UIs), `/settings/tools` (read-only table).
  - Builder route `/settings/methodologies/[id]/builder`: tabbed
    layout (Workflow canvas + Roles/Tools/Budget/Metadata forms),
    node inspector Sheet, `+ Add Node` command palette, sequential +
    loop-back edges, Condition Builder (no-code rows compiling to
    `simpleeval`, AND-only, with advanced expression escape hatch),
    toolbar (Validate / Save / Set-as-Default / Duplicate / Export /
    Import YAML).
  - Node types: Built-in Stage, Role (built-in or library), Custom
    Code (discovered `custom_nodes/*.py`, read-only, "Authored in
    code" badge).
  - Retirement of the raw-YAML `[id]` route: its "Edit" entry points
    open `/builder` directly (redirect or replace — one edit surface,
    never two).
- Out of scope:
  - Authoring Tier C Python in the browser (builder selects/places
    discovered custom nodes only; code is written in an IDE).
  - OR/nested condition groups in the Condition Builder (AND-chain
    only in v1; raw-expression advanced mode covers the rest).
  - Methodology versioning/history beyond git (unchanged from Phase 5).
  - New pipeline semantics: the builder emits only what the Phase
    5/5b schema + compiler already accept (`loop_condition`,
    `custom_roles`, Tier C names). No compiler changes expected; any
    gap found is a builder bug, not a compiler feature request.

## Contracts (success criteria)

- Libraries-first: Skills/Prompts/Roles/Tools pages CRUD against the
  real backend (not mocks) before the canvas lands; the canvas
  palette/comboboxes populate from them.
- Round-trip: canvas → methodology YAML → `build_graph_from_methodology`
  succeeds on the simplest sequential case (built-in stages only)
  before Role nodes, Custom Code nodes, or conditions are added.
- A methodology composed entirely in the builder (stages + a library
  role + one AND-chained loop condition) saves, passes server-side
  validation, and runs — the custom stage appears in the run event
  log and the loop behaves per its condition (true → loop taken).
- Client-side Validate catches unknown refs, orphaned loop targets,
  and judge/council overlap before save; Save stays disabled until
  Validate passes; server remains authoritative (422 names the
  offending field — never a half-built graph, per Phase 5 contract).
- Prompt version history: every save creates a revertable version.
- Role edits warn they propagate to every referencing methodology
  (Tooltip on the edit link); Tools tab states roles may restrict,
  never expand, the methodology tool set.
- Judge/council overlap is refused live (red row highlight + Tooltip
  in the Roles tab), same fail-closed check as run-start.
- Old YAML-editor route no longer coexists as a second edit surface.

## Anti-patterns

- No builder before libraries: the Condition Builder is not built
  before plain sequential canvas works (it has nothing to attach to).
- No second pipeline definition: the builder compiles to methodology
  YAML consumed by the existing compiler — no parallel graph
  language, no canvas-only semantics the YAML cannot express.
- No Tier C authoring theater: the UI labels custom nodes
  "authored in code" and never implies browser editing.
- No silent expression breakage: if an advanced-mode expression no
  longer matches a simple AND-chain pattern, the no-code rows disable
  with an explanatory note — never silently rewrite the expression.
- No shadcn bulk-install: components pulled per need via CLI (see
  Tooling); no custom styled divs where a shadcn primitive exists
  (control-panel-ux spec §Contracts/Anti-patterns still apply:
  semantic tokens only, `cn()`, no `space-x/y`, titled Dialogs).
- No direct HTTP from custom nodes (Phase 5b `# TOOL-LAYER:`
  convention, unchanged); no new data-fetching library (native
  `fetch` only, per constitution).

## Decisions

- Canvas: React Flow (`@xyflow/react`) — standard shadcn pairing,
  owns viewport/selection/handles; loop-back uses a dedicated second
  handle that always creates a dashed edge and opens the Condition
  Builder (a loop-back without a condition is meaningless).
- Forms: `react-hook-form + zod`, schemas mirroring backend Pydantic
  models 1:1 for client validation matching server validation.
- Palette/search: `cmdk` (via shadcn `Command`); toasts: `sonner`;
  Skills body editing: `@uiw/react-md-editor`; advanced expression
  editing: minimal CodeMirror 6 behind a collapsed toggle.
- shadcn components to pull (not bulk): `dialog`, `sheet`,
  `command`, `tabs`, `card`, `badge`, `dropdown-menu`, `field`
  (the registry's `form` wrapper is unresolvable as of CLI 4.21 —
  `field` + react-hook-form directly is its documented successor),
  `table`, `combobox` (composed `command`+`popover`), `accordion`,
  `scroll-area`, `resizable`, `tooltip`, `sonner`, `select`,
  `switch`, `input`, `textarea`, `separator`, plus `checkbox`,
  `popover` (implied by combobox).
- Backend additions extend the API Reference doc if it is the
  endpoint-list source of truth (input §10 table adopted as the
  contract: skills/prompts/roles CRUD, tools registry, condition-
  fields, validate-without-save).
- Custom inventory (`NodePalette`, `ConditionBuilder`, `RoleCard`,
  `StageCard`, `CustomCodeCard`, `ModelCombobox`,
  `ValidationToastList`, `PromptVersionHistory`) composes shadcn
  primitives — committed as source under the builder route/components.
- Frontend data flow stays `/api/v1`-exclusive; builder client-side
  compilation (no-code rows → `simpleeval` string) is validated by
  the same server endpoint as raw YAML.

## Tooling (optional)

- New npm deps (installed once, on approval, by PBI-064):
  `@xyflow/react`, `react-hook-form`, `zod`, `cmdk` (if not pulled
  by shadcn CLI), `sonner`, `@uiw/react-md-editor`,
  `@codemirror/lang-javascript` + `@codemirror/view` (minimal CM6;
  PBI-064 installed `@codemirror/view` only — `lang-javascript`
  deferred to PBI-068, which owns the first CodeMirror code).
  Quality: all are multi-million-download/week, maintainer-official
  packages (xyflow team, RHF, Vercel/shadcn-adjacent sonner) —
  no skills.sh lookup needed; no `skills` CLI in this environment
  (established 2026-09-10).
- Agent skills reused (already adopted): `shadcn` (component docs —
  run `npx shadcn@latest docs <component>` before non-trivial
  composition), `ui-ux-pro-max` (design-system checklist for new
  pages). No new agent skills.
- Gates unchanged: backend `uv run pytest` halves, frontend
  `typecheck` + `vitest run` + `next build`; new canvas tests are
  RTL + jsdom where possible (React Flow rendering in jsdom needs a
  ResizeObserver mock — precedent: check how existing component
  tests handle DOM APIs before reaching for Playwright).
