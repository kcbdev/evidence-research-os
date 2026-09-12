# Evidence Research OS — No-Code Methodology Builder: UI/UX Map & shadcn Implementation Guide

Replaces §14 of `Evidence-Research-OS-Frontend-UX-Spec-v1.md` ("YAML editor, not a builder"). This is the builder instead.

---

## 0. Design principle

A Methodology is a **composition**, not a document. Four reusable libraries — **Skills, Prompts, Custom Roles, Tools** — get authored once and referenced from many methodologies. The **Canvas** is where you compose references from those libraries into a workflow. Nothing is duplicated into the methodology itself except the references and the wiring (order, loop conditions, interrupts).

**No-code, with one honest exception:** Tier C custom-code nodes (Phase 5b) are still authored in an IDE — the builder can *select and place* a discovered custom node on the canvas, but cannot *write* its Python. Call this out in the UI itself (a small "authored in code" badge), don't pretend otherwise.

---

## 1. Tech stack for this build

| Concern | Choice | Why |
|---|---|---|
| Component primitives | **shadcn/ui** | Already your stack's direction; owns markup, not a black-box dependency |
| Node-graph canvas | **React Flow (`@xyflow/react`)** | The standard pairing with shadcn for visual workflow builders — handles) |
| Forms | **react-hook-form + zod** | zod schemas mirror your backend Pydantic models 1:1 — define once, reuse for client validation matching server validation |
| Command palette | **cmdk** (shadcn's `Command` wraps this already) | "Add node" picker, global search |
| Toasts | **sonner** (shadcn's recommended toast replacement) | Save confirmations, validation errors |
| Markdown editing (Skills body) | **`@uiw/react-md-editor`** (lightweight, not in shadcn) | Skills are markdown procedures — needs a real editor, not a bare textarea |
| Expression escape hatch (Tier B advanced mode) | **CodeMirror 6** minimal setup | Only shown behind "Edit as expression" toggle — most users never see this |

Install shadcn components as needed via CLI (`npx shadcn@latest add <component>`) — don't bulk-install the whole library, pull in: `dialog`, `sheet`, `command`, `tabs`, `card`, `badge`, `dropdown-menu`, `form`, `table`, `combobox` (composed from `command`+`popover`), `accordion`, `scroll-area`, `resizable`, `tooltip`, `sonner`, `select`, `switch`, `input`, `textarea`, `separator`.

---

## 2. Sitemap addition

```
/settings/methodologies                    List (unchanged from before)
/settings/methodologies/[id]/builder       ★ NEW — the visual canvas builder
/settings/skills                           ★ NEW — Skills library
/settings/prompts                          ★ NEW — Prompts library
/settings/roles                            ★ NEW — Custom Roles library
/settings/tools                            ★ NEW — Tools registry (read-only)
```

`/settings/methodologies/[id]` (the old YAML-editor route) is removed; the list page's "Edit" action now opens `/builder` directly.

---

## 3. Methodology Builder (`/settings/methodologies/[id]/builder`)

### 3.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [name, inline-editable]  Compatible: [research] [+]         │
│                          [Validate] [Save] [Set Default] [⋮]│
├───────────┬───────────────────────────────────┬─────────────┤
│ Tabs:     │                                   │  (Node       │
│ Workflow  │         REACT FLOW CANVAS          │  Inspector   │
│ Roles     │                                   │  Sheet, only │
│ Tools     │  [+ Add Node] floating button      │  visible     │
│ Budget    │  (opens Command palette)           │  when a node │
│ Metadata  │                                   │  is selected)│
└───────────┴───────────────────────────────────┴─────────────┘
```

Left: shadcn `Tabs` (vertical orientation), only "Workflow" renders the canvas — the other four are plain forms (§3.3-3.6). Right: shadcn `Sheet` (side="right"), slides in on node selection, `Resizable` panel so it can be widened for complex role configs.

### 3.2 Canvas (Workflow tab)

**Node types** (React Flow custom node components):

| Node type | Visual | Source |
|---|---|---|
| Built-in Stage | Card with a stage icon (`lucide-react`) + name, e.g. "Citation Audit" | `NODE_REGISTRY` (spec Phase 5 Task 39) |
| Role node | Card with a persona icon + role name + small badges: model name, tool count | Built-in roles (scientist/investigator/skeptic/judge) or Custom Roles library |
| Custom Code node | Card with a code icon + filename + "Authored in code" `Badge` (muted variant) | Discovered `custom_nodes/*.py` (Phase 5b) |

**Edges:** solid = sequential flow. Dashed, colored amber = loop-back (has an attached condition — click the edge to open the Condition Builder in the Sheet).

**Adding a node:** floating `+` button (bottom-right of canvas, shadcn `Button` with `size="icon"`) opens a `CommandDialog` (Cmd+K also bound):
```
┌ Add a stage ──────────────────────────────┐
│ 🔍 search...                              │
│ Built-in Stages                           │
│   Plan   Independent First Pass   ...     │
│ Custom Roles (from your library)          │
│   Red Team Reviewer   ...                 │
│   + Create new custom role                │
│ Custom Code (discovered)                  │
│   experiment_scorer.py                    │
└────────────────────────────────────────────┘
```
Selecting "Create new custom role" closes the palette and opens the Role editor (§5) in a `Dialog`, with the new role auto-added to the canvas on save.

**Connecting nodes:** drag from a node's output handle to the next node's input handle — standard React Flow. Holding no modifier = sequential edge. A dedicated second handle (bottom of the card, styled distinctly) is the **loop-back handle** — dragging from it always creates a dashed loop edge and immediately opens the Condition Builder, since a loop-back with no condition is meaningless.

**Toolbar actions** (top-right, shadcn `DropdownMenu` for the `⋮` overflow):
- **Validate** — compiles against the schema client-side (unknown refs, orphaned loop targets, judge/council overlap) without saving; shows results as a `Sonner` toast list, red for errors, amber for warnings
- **Save** — persists; disabled until Validate passes
- **Set as Default** — confirm `Dialog` (this changes real run behavior)
- Overflow: Duplicate, Export YAML (read-only `Dialog` with copy button — escape hatch for those who want to see/version the raw file), Import YAML (power-user path: paste YAML, parses into the canvas — still validated the same way)

### 3.3 Node Inspector (Sheet content, varies by selected node type)

**Built-in Stage node:**
- Read-only description (what this stage does — pulled from a static registry description, not editable)
- `Switch`: "Pause here for approval" (maps to `interrupt: true`)
- If this stage is loop-capable (has an incoming loop-back edge): embedded Condition Builder (§4)

**Role node** (built-in or custom):
- `Combobox`: which library entry fills this slot (searchable, shows both built-in roles and Custom Roles library entries in one list)
- Model: inherits from Settings → Models by default; `Switch` "Override for this stage" reveals a model `Combobox` if toggled
- Tools: inherits from the role's own definition; same override pattern
- "Edit this role" link → opens the Role editor (§5) in a `Dialog`, edits propagate to every methodology referencing it — a small warning `Tooltip` on this link ("Editing affects all methodologies using this role") sets that expectation

**Custom Code node:**
- Read-only `Card`: filename, `NODE_ID`, description (from the file's docstring), "Authored in code — edit in your IDE" `Badge`
- Copy-path button (for jumping to the file)

### 3.4 Roles tab
Table (shadcn `Table`): role slot (scientist/investigator/skeptic/judge/+ any custom roles used in this methodology) × assigned model. Same judge/council-overlap live validation as Settings → Models (§7), surfaced inline as a red row highlight + `Tooltip` explaining why, not just on save.

### 3.5 Tools tab
Checklist (shadcn `Checkbox` grid, grouped by tool category) of which tools this methodology enables globally. Individual role nodes can further restrict (not expand) within their own config — note this constraint directly in the tab's header text.

### 3.6 Budget tab
Plain `Form`: max_model_calls, max_research_rounds, max_sources, max_sources_per_claim — number `Input`s with sensible min/max, pre-filled from Settings → Budget defaults.

### 3.7 Metadata tab
Name, description (`Textarea`), Compatible modes (multi-`Select` — research/brainstorm/academic).

---

## 4. Condition Builder (no-code, embedded in Node Inspector or Edge selection)

```
Repeat this stage while:
[ open_contradictions count ▾ ] [ > ▾ ] [ 0        ]
                                                  [+ AND]
[Advanced: edit as expression]  ← collapsed by default
```

- Field `Combobox`: populated from a fixed list of condition-eligible state fields (needs a small backend reference endpoint — see §8)
- Operator `Select`: `>`, `<`, `==`, `!=`, `contains`, `is true`, `is false` — filtered by the field's type (numeric fields don't offer `contains`)
- Value `Input`: type matches field (number input for counts, `Switch` for booleans)
- "+ AND" adds a second row — v1 supports AND-chaining only, not OR/nested groups (real complexity there isn't justified until you hit a case that needs it)
- Compiles client-side into the `simpleeval` expression string (spec Phase 5b Tier B) before sending to the backend — the user never sees or writes expression syntax unless they explicitly open "Advanced"
- "Advanced" reveals a `CodeMirror` textarea with the raw expression, pre-filled with the compiled string, editable directly — round-trips back into the no-code rows if it still matches a simple single/AND-chain pattern, otherwise the no-code rows disable with a note ("this expression is too complex to edit visually — advanced mode only")

---

## 5. Custom Roles Library (`/settings/roles`)

**List view:** `Card` grid — role name, one-line description, which methodologies currently reference it (small badge list), "+ New Role".

**Editor (`Dialog`, opened from list or inline from the Canvas):**
- Name/ID (`Input`)
- Description (`Textarea`)
- System prompt: `Combobox` to pick an existing Prompts-library entry, **or** a `Textarea` + "Save as reusable prompt" `Checkbox` to write one inline and promote it to the library in the same action
- Tools: `Checkbox` grid from the Tools registry
- Model: searchable `Combobox` (same component as Settings → Models)
- Output schema: `Select` — "Freeform" or a known schema name (if you've defined structured output types)
- Skills: multi-`Combobox` from the Skills library

---

## 6. Prompts Library (`/settings/prompts`)

**List view:** `Table` — name, description, last edited, used-by-count.

**Editor:**
- Name, description
- Prompt text (`Textarea`, generous height)
- Version history: every save creates a new version (`Accordion` showing past versions with timestamp, "Revert to this version" per entry) — this matters because prompt iteration is exactly the kind of change you'll want to undo after a bad experiment

---

## 7. Skills Library (`/settings/skills`)

**List view:** `Card` grid — name, description, which roles currently use it.

**Editor:**
- Name, description
- Body: `@uiw/react-md-editor` (write/preview split, matches the "procedural memory as markdown" design from the memory-architecture spec) — this is literally the Skill file content
- Assigned roles: read-only list here (assignment happens from the Role editor's Skills field, not this side, to avoid two sources of truth for the same relationship)

---

## 8. Tools Registry (`/settings/tools`)

**Read-only `Table`:** tool name, description, source MCP server. No create/edit here — new tools are a backend/MCP-server concern (adding a new tool implementation is code, not configuration), and this page says so explicitly in its header rather than implying you can add one.

---

## 9. Component inventory (custom, built on shadcn primitives)

| Component | Composed from | Used in |
|---|---|---|
| `NodePalette` | `CommandDialog` | Canvas "+ Add Node" |
| `ConditionBuilder` | `Combobox` + `Select` + `Input`/`Switch` + `CodeMirror` (advanced) | Node Inspector, Edge selection |
| `RoleCard` (React Flow custom node) | `Card` + `Badge` | Canvas |
| `StageCard` (React Flow custom node) | `Card` + icon | Canvas |
| `CustomCodeCard` (React Flow custom node) | `Card` + `Badge` (muted) | Canvas |
| `ModelCombobox` | `Command` + `Popover` | Roles tab, Custom Role editor, Settings → Models |
| `ValidationToastList` | `Sonner` | Canvas "Validate" action |
| `PromptVersionHistory` | `Accordion` | Prompts editor |

---

## 10. Backend API additions needed

Not in the original API reference — add these for the libraries to be real (not just UI mockups against nothing):

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/skills` | List/create Skill library entries |
| GET/PUT | `/skills/{id}` | Read/update one |
| GET/POST | `/prompts` | List/create Prompt library entries (POST creates a new version if id exists) |
| GET | `/prompts/{id}/versions` | Version history |
| GET/POST | `/roles` | List/create Custom Role library entries |
| GET/PUT | `/roles/{id}` | Read/update one |
| GET | `/tools` | Tools registry (read-only, reflects backend MCP tool config) |
| GET | `/methodologies/condition-fields` | Reference data for the Condition Builder's Field dropdown — `[{"field": "open_contradictions", "type": "count"}, {"field": "audit_passed", "type": "bool"}, ...]` |
| POST | `/methodologies/{id}/validate` | Client-triggered validation without saving |

These extend `Evidence-Research-OS-API-Reference-v1.md` — worth adding there too if you want one source of truth for the full endpoint list; say the word and I'll fold them in.

---

## 11. Implementation order

1. Skills/Prompts/Roles/Tools libraries first (plain CRUD pages, no canvas) — these are simpler and the Canvas depends on them existing to populate its palette and comboboxes.
2. React Flow canvas with built-in Stage nodes only, sequential edges only, no loop conditions yet, no Role nodes — validates the graph-compiler round-trip (canvas → methodology YAML → `build_graph_from_methodology`) on the simplest possible case.
3. Add Role nodes (referencing the now-existing Roles library) and Custom Code nodes.
4. Add the Condition Builder + loop-back edges.
5. Validate/Save/Set-Default toolbar actions, wired to the real backend validation endpoint.

Don't build the Condition Builder before plain sequential canvas works — it's the most complex single piece (no-code UI compiling to a real expression string) and has nothing to attach to until stages and edges exist.
