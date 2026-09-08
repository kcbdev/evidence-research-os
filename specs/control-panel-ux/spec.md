# Spec: control-panel-ux (shadcn + dark-first overhaul)

## Goal

Rebuild the control panel's presentation on shadcn primitives with a
dark-first OLED design system (ui-ux-pro-max recommendation), keeping
every route, API contract, and behavior identical: same 5 routes, same
`/api/v1` calls, same gates green. Better UX means: persistent
navigation shell (no more back-link mazes), consistent components
instead of hand-rolled divs, readable dark theme from tokens (not
per-file `dark:` overrides), and a responsive layout (375 → 1440)
verified at each breakpoint.

## Scope

- In scope:
  - `shadcn init` (v4 CLI, Tailwind v4 CSS-first theme) + components:
    button, card, table, badge, input, select, tabs, dialog,
    progress, skeleton, empty, separator, label (+ tooltip if free).
  - AppShell (brand + breadcrumb context + uniform container) on all
    routes; real tab/tabpanel semantics kept.
  - All 5 routes restyled: `/`, `/lab/[id]`, `/lab/[id]/claims`,
    `/lab/[id]/runs/[runId]`, plus both dialogs.
  - Dark-first OLED tokens (#0F172A bg, slate scale, green-500
    accent); light mode keeps working (no regression) but is not
    design-reviewed.
  - Responsive: mobile-first; tables scroll-x with sticky first
    column OR collapse to cards where trivial; grids stack; tabs
    scroll; touch targets ≥ 44px; no horizontal page scroll.
  - Keep scaffold fonts (no new webfont dependency at build time).
- Out of scope: any API/backend change; new routes; charts/graphs
  (Phase 4); full WAI-ARIA tab keyboard roving (already deferred);
  animations beyond 150–300ms transitions + reduced-motion respect;
  emoji-as-icon purge beyond touched files (badge ⚠ → Lucide icon
  where touched).

## Contracts (success criteria)

- `tsc --noEmit`, `vitest run`, `next build` green throughout.
- Every existing test either passes unmodified or is updated for new
  markup with the SAME behavioral assertion (no deleted coverage).
- No `dark:` color overrides in new code — semantic tokens only
  (grep-enforced in review).
- shadcn rules honored: composition (CardHeader/Title/Content…),
  Dialog always titled, Empty/Skeleton/Alert/Badge/Separator used
  where they apply, `cn()` for conditionals, no space-x/y.
- Responsive verified at 375/768/1024/1440 (documented manual pass
  with screenshots or Playwright viewport checks).
- Pre-delivery checklist (skill): no emoji icons in touched files,
  visible focus, reduced-motion, keyboard paths preserved
  (row buttons, modal Escape, tab selection).

## Anti-patterns

- Custom styled divs where a shadcn component exists.
- Raw hex / blue-500 accents; manual `dark:` color pairs.
- `space-x-*` / `space-y-*`; manual ternaries instead of `cn()`.
- Changing API shapes, routes, or behavior "while in there".
- Deleting tests instead of adapting them to new markup.

## Decisions

- shadcn v4 CLI (`npx shadcn@latest`), components vendored as source
  (standard shadcn model — committed, not gitignored).
- Dark-first per ui-ux-pro-max `--design-system` output (2026-09-08);
  pattern/FAQ parts of that output ignored as off-topic.
- Existing vitest + RTL suite is the behavioral lock; Playwright
  (already a configured skill here) for viewport verification.

## Tooling

- Skills: `shadcn` (components/presets/docs), `ui-ux-pro-max`
  (design system, checklist, style queries).
- `npx shadcn@latest docs <component>` before composing anything
  non-trivial.
