/**
 * Canvas ↔ methodology mapping (PBI-066).
 *
 * The methodology YAML stays the single source of truth: the canvas
 * holds node *positions* plus a stage-id → stage-object map, and the
 * sequence comes from the *edges* (walked from the single start node),
 * never from pixel order. Stage objects themselves are never rewritten
 * here — loop/route keys a later PBI draws are preserved byte-identical
 * through load/save cycles that never touch them.
 */
import type { Edge, Node } from "@xyflow/react";
import type { MethodologyDetail } from "./api";

export interface StageSpecLike {
  id: string;
  node: string;
  [k: string]: unknown;
}

export interface StageNodeData extends Record<string, unknown> {
  stageId: string;
  node: string;
  label: string;
  kind: BuilderNodeKind;
  /** Role nodes: display name + embedded-spec summary (badges). */
  roleName?: string;
  model?: string;
  toolCount?: number;
  /** Custom-code nodes: discovered file facts (read-only). */
  filename?: string;
  fileDescription?: string;
}

export type BuilderNodeKind = "stage" | "role" | "code";

export type StageNode = Node<StageNodeData, BuilderNodeKind>;

/** Built-in stages, mirroring app/graph/registry.py NODE_REGISTRY.
 * OWNERSHIP: unavoidable frontend/backend duplication (the browser
 * cannot import .py). When the registry gains a stage, add it here —
 * nothing fails automatically, so check this list when touching
 * NODE_REGISTRY (PBI-067's palette sections depend on it too). */
export const BUILT_IN_STAGES: { node: string; label: string }[] = [
  { node: "trigger_classifier", label: "Trigger Classifier" },
  { node: "plan", label: "Plan" },
  { node: "independent_first_pass", label: "Independent First Pass" },
  { node: "evidence_extraction", label: "Evidence Extraction" },
  { node: "conflict_detection", label: "Conflict Detection" },
  { node: "novelty_check", label: "Novelty Check" },
  { node: "targeted_research", label: "Targeted Research" },
  { node: "adversarial_review", label: "Adversarial Review" },
  { node: "evidence_adjudication", label: "Evidence Adjudication" },
  { node: "methodology_analysis", label: "Methodology Analysis" },
  { node: "reproducibility_audit", label: "Reproducibility Audit" },
  { node: "synthesis", label: "Synthesis" },
  { node: "citation_audit", label: "Citation Audit" },
  { node: "targeted_repair", label: "Targeted Repair" },
  { node: "human_checkpoint", label: "Human Checkpoint" },
  { node: "final_output", label: "Final Output" },
];

export function stageLabel(node: string): string {
  const found = BUILT_IN_STAGES.find((s) => s.node === node);
  if (found) return found.label;
  return node
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const NODE_W = 220;
export const NODE_H = 120;
export const ROW_H = 140;

export interface LibraryRoleLite {
  id: string;
  name: string;
  model: string;
  tools: string[];
}

export interface CustomNodeLite {
  node_id: string;
  filename: string;
  description: string;
}

export function methodologyToFlow(
  m: MethodologyDetail,
  roles: LibraryRoleLite[] = [],
  codes: CustomNodeLite[] = [],
): {
  nodes: StageNode[];
  edges: Edge[];
} {
  const stages = (m.workflow?.stages ?? []) as StageSpecLike[];
  const embedded = new Map(
    ((m as { custom_roles?: { id: string; model: string; tools: string[] }[] }).custom_roles ?? []).map(
      (r) => [r.id, r],
    ),
  );
  const codeById = new Map(codes.map((c) => [c.node_id, c]));
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const nodes: StageNode[] = stages.map((s, i) => {
    const spec = embedded.get(s.node);
    const code = spec === undefined ? codeById.get(s.node) : undefined;
    const kind: BuilderNodeKind = spec !== undefined ? "role" : code !== undefined ? "code" : "stage";
    const role = spec !== undefined ? roleById.get(s.node) : undefined;
    return {
      id: s.id,
      type: kind === "stage" ? "stage" : kind === "role" ? "role" : "code",
      position: { x: 0, y: i * ROW_H },
      // Explicit dimensions: React Flow skips measuring (no layout flash
      // in production) and renders nodes visible in jsdom, where nothing
      // is ever measured (unmeasured nodes stay visibility:hidden and
      // vanish from role queries).
      width: NODE_W,
      height: NODE_H,
      data: {
        stageId: s.id,
        node: s.node,
        label:
          kind === "role"
            ? (role?.name ?? stageLabel(s.node))
            : stageLabel(s.node),
        kind,
        ...(spec !== undefined
          ? {
              roleName: role?.name ?? stageLabel(s.node),
              model: spec.model,
              toolCount: spec.tools.length,
            }
          : {}),
        ...(code !== undefined
          ? { filename: code.filename, fileDescription: code.description }
          : {}),
      },
    };
  });
  const edges: Edge[] = [];
  for (let i = 0; i + 1 < stages.length; i += 1) {
    edges.push({
      id: `e-${stages[i].id}-${stages[i + 1].id}`,
      source: stages[i].id,
      target: stages[i + 1].id,
    });
  }
  // Loop-backs (PBI-068): drawn only for the canvas-owned form
  // (loop_condition + a resolvable loop_target). Registry
  // (loop_while), unconditional (loop_always), and forward-router
  // (route) stages are hand-owned: no canvas edge, keys round-trip
  // untouched through stageMap.
  const ids = new Set(stages.map((s) => s.id));
  for (const s of stages) {
    if (
      typeof s.loop_condition === "string" &&
      s.loop_condition.trim() !== "" &&
      typeof s.loop_target === "string" &&
      ids.has(s.loop_target)
    ) {
      edges.push({
        id: `${LOOP_EDGE_PREFIX}${s.id}-${s.loop_target}`,
        source: s.id,
        target: s.loop_target,
        style: LOOP_EDGE_STYLE,
      });
    }
  }
  return { nodes, edges };
}

export function nextStageId(node: string, taken: Set<string>): string {
  if (!taken.has(node)) return node;
  let n = 2;
  while (taken.has(`${node}-${n}`)) n += 1;
  return `${node}-${n}`;
}

export function orderStages(
  nodes: StageNode[],
  edges: Edge[],
  stageMap: Record<string, StageSpecLike>,
): { stages: StageSpecLike[] } | { error: string } {
  if (nodes.length === 0) {
    return { error: "Canvas is empty — add at least one stage from the palette." };
  }
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, string>();
  const incoming = new Map<string, number>();
  for (const e of edges) {
    // Loop-backs are conditional branches, not chain links: they must
    // never feed the sequential walk (a backward loop would read as a
    // cycle). Validated separately by validateLoops.
    if (isLoopEdge(e)) continue;
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    out.set(e.source, e.target);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }
  const starts = nodes.filter((n) => !incoming.has(n.id));
  if (starts.length === 0 && nodes.length > 0) {
    return { error: "Canvas has a cycle — connect stages in one chain." };
  }
  // Walk the first chain; anything unreachable is disconnected (this
  // covers forks too — a second chain IS a set of disconnected nodes,
  // and naming them is more actionable than counting chains).
  const ordered: StageNode[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = starts[0]?.id;
  while (cur !== undefined) {
    if (seen.has(cur)) {
      return { error: "Canvas has a cycle — connect stages in one chain." };
    }
    seen.add(cur);
    const node = nodes.find((n) => n.id === cur);
    if (node) ordered.push(node);
    cur = out.get(cur);
  }
  const missing = nodes.filter((n) => !seen.has(n.id)).map((n) => n.id).sort();
  if (missing.length > 0) {
    return {
      error: `Disconnected stage${missing.length === 1 ? "" : "s"}: ${missing.join(", ")} — connect or delete before saving.`,
    };
  }
  const stages: StageSpecLike[] = [];
  for (const n of ordered) {
    const s = stageMap[n.id];
    if (s === undefined) {
      return { error: `Stage ${n.id} has no data — re-add it from the palette.` };
    }
    stages.push(s);
  }
  return { stages };
}

export interface HoverConnection {
  source: string | null;
  target: string | null;
}

/**
 * Sequential-only connect (PBI-066): one chain, so a new connection
 * replaces any existing edge out of the source or into the target.
 * Loop edges are never touched here (connectLoop owns them) — a
 * sequential rewire must not drop a condition, and vice versa.
 * Pure — the page reports `replaced` to the user instead of dropping
 * edges silently.
 */
export function connectConstrained(
  edges: Edge[],
  conn: HoverConnection,
): { edges: Edge[]; replaced: boolean } {
  if (conn.source === null || conn.target === null) return { edges, replaced: false };
  const loops = edges.filter(isLoopEdge);
  const seq = edges.filter((e) => !isLoopEdge(e));
  const pruned = seq.filter(
    (e) => e.source !== conn.source && e.target !== conn.target,
  );
  const next: Edge = {
    id: `e-${conn.source}-${conn.target}`,
    source: conn.source,
    target: conn.target,
  };
  const exists = pruned.some(
    (e) => e.source === next.source && e.target === next.target,
  );
  return {
    edges: exists ? [...loops, ...pruned] : [...loops, ...pruned, next],
    replaced: pruned.length !== seq.length,
  };
}

/**
 * Re-link across a deletion batch (PBI-066): surviving entries into * the removed closure connect straight to surviving exits. Covers
 * single middle delete, head/tail delete (no bridge), and
 * multi-select block delete with one rule — never silently fork or
 * strand. Pure for the same reason as connectConstrained: jsdom never
 * renders RF edges (EdgeWrapper needs measured handle bounds), so
 * deletion topology is unit-tested here, not through the canvas.
 */
export function bridgeDeletions(edges: Edge[], removedIds: string[]): Edge[] {
  if (removedIds.length === 0) return edges;
  const gone = new Set(removedIds);
  // Bridging is sequential-only: a loop touching a deleted node is
  // dropped (its keys are cleared by the page with a notice), never
  // re-hung onto a survivor. Loop edges must not feed the
  // entry/exit computation either.
  const seq = edges.filter((e) => !isLoopEdge(e));
  const entries = seq
    .filter((e) => !gone.has(e.source) && gone.has(e.target))
    .map((e) => e.source);
  const exits = seq
    .filter((e) => gone.has(e.source) && !gone.has(e.target))
    .map((e) => e.target);
  const kept = edges.filter((e) => !gone.has(e.source) && !gone.has(e.target));
  if (entries.length === 1 && exits.length === 1 && entries[0] !== exits[0]) {
    const bridge: Edge = {
      id: `e-${entries[0]}-${exits[0]}`,
      source: entries[0],
      target: exits[0],
    };
    if (!kept.some((e) => e.source === bridge.source && e.target === bridge.target)) {
      kept.push(bridge);
    }
  }
  return kept;
}

export interface EmbedLike {
  model: string;
  tools: string[];
}

/**
 * Whether a methodology-embedded role copy differs from its library
 * entry (PBI-067). The canvas derives "has local overrides" from this
 * instead of tracking flags — derivation survives reloads, switches,
 * and deletes, which flag-tracking cannot. A missing side protects
 * (never clobber what you cannot compare).
 */
export function embedDiffers(
  embed: EmbedLike | undefined,
  lib: EmbedLike | undefined,
): boolean {
  if (!embed || !lib) return true;
  if (embed.model !== lib.model) return true;
  const a = [...embed.tools].sort().join(" ");
  const b = [...lib.tools].sort().join(" ");
  return a !== b;
}

// --- Condition Builder + loop-back edges (PBI-068) ---

/** Field reference row from GET /methodologies/condition-fields. */
export interface ConditionFieldLite {
  field: string;
  type: "count" | "bool";
}

/** One no-code builder row. `value` is a number for count rows; bool
 * rows carry the choice in `op` ("is true"/"is false") and ignore it. */
export interface ConditionRow {
  field: string;
  op: string;
  value: number | boolean;
}

/** Count operators mirror the backend ConditionField contract
 * (libraries.py): >, <, ==, != — never `contains` (these are
 * list-valued state fields read through len(), not text). */
export const COUNT_OPS = [">", "<", "==", "!="] as const;

/** Bool operators are UI labels; both compile to `== True|False`. */
export const BOOL_OPS = ["is true", "is false"] as const;

export function operatorsForFieldType(type: ConditionFieldLite["type"]): string[] {
  return type === "count" ? [...COUNT_OPS] : [...BOOL_OPS];
}

/** Fresh row for a field (used by "+ AND" and field switches). */
export function defaultRowFor(
  fields: ConditionFieldLite[],
  fieldName?: string,
): ConditionRow | null {
  const found =
    (fieldName !== undefined
      ? fields.find((f) => f.field === fieldName)
      : undefined) ??
    fields.find((f) => f.type === "count") ??
    fields[0];
  if (!found) return null;
  return found.type === "count"
    ? { field: found.field, op: ">", value: 0 }
    : { field: found.field, op: "is true", value: true };
}

/**
 * Compile no-code rows to the `simpleeval` string stored as the
 * stage's `loop_condition`. Count rows read list-valued state through
 * len() (the backend Tier B form, e.g. `len(open_contradictions) > 0`);
 * bool rows compare against True/False. AND-chaining only — no
 * OR/nested groups in v1. Empty rows compile to null (no condition).
 */
export function compileCondition(rows: ConditionRow[]): string | null {
  if (rows.length === 0) return null;
  return rows.map(compileRow).join(" and ");
}

function compileRow(row: ConditionRow): string {
  if (row.op === "is true") return `${row.field} == True`;
  if (row.op === "is false") return `${row.field} == False`;
  const value = typeof row.value === "number" ? row.value : 0;
  return `len(${row.field}) ${row.op} ${value}`;
}

const COUNT_PART =
  /^len\(([A-Za-z_][A-Za-z0-9_]*)\)\s*(==|!=|>|<)\s*(-?\d+)$/;
const BOOL_PART =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*(==|is(?:\s+not)?)\s*(True|False)$/;

/**
 * Parse a `loop_condition` back into no-code rows. Returns null when
 * the expression is too complex to edit visually (OR, nesting, calls
 * beyond len(), unknown or type-mismatched fields, non-integer
 * counts) — the caller disables the rows with the advanced-mode note
 * instead of rewriting. Never throws, never normalizes the input.
 */
export function parseCondition(
  expression: string,
  fields: ConditionFieldLite[],
): ConditionRow[] | null {
  const byName = new Map(fields.map((f) => [f.field, f.type]));
  const parts = expression
    .split(/\s+and\s+/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length === 0) return null;
  const rows: ConditionRow[] = [];
  for (const part of parts) {
    const row = parsePart(part, byName);
    if (row === null) return null;
    rows.push(row);
  }
  return rows;
}

function parsePart(
  part: string,
  byName: Map<string, ConditionFieldLite["type"]>,
): ConditionRow | null {
  const count = COUNT_PART.exec(part);
  if (count) {
    const [, field, op, raw] = count;
    if (byName.get(field) !== "count") return null;
    return { field, op, value: Number.parseInt(raw, 10) };
  }
  const bool = BOOL_PART.exec(part);
  if (bool) {
    const [, field, cmp, literal] = bool;
    if (byName.get(field) !== "bool") return null;
    // `is not True` === `== False`, and vice versa — the rows show
    // the normalized polarity; the stored string is untouched.
    const truthy =
      (cmp === "==" || cmp === "is") === (literal === "True");
    return { field, op: truthy ? "is true" : "is false", value: truthy };
  }
  return null;
}

/** React Flow source-handle id for loop-backs (all card kinds). */
export const LOOP_HANDLE_ID = "loop";

/** Loop-edge id prefix — the canvas tags loop-backs so the pure
 * helpers can exclude them from the sequential chain. */
export const LOOP_EDGE_PREFIX = "e-loop-";

/** Dashed amber edge style, shared by load-draw and drag-create. */
export const LOOP_EDGE_STYLE: Edge["style"] = {
  stroke: "#f59e0b",
  strokeDasharray: "6 4",
};

export function isLoopEdge(e: Pick<Edge, "id">): boolean {
  return e.id.startsWith(LOOP_EDGE_PREFIX);
}

/**
 * Loop-back connect (PBI-068): one loop per source stage
 * (`loop_target` is scalar), so a new loop replaces any existing loop
 * out of the source. Sequential edges are never touched. Pure.
 */
export function connectLoop(
  edges: Edge[],
  conn: HoverConnection,
): { edges: Edge[]; replaced: boolean } {
  if (conn.source === null || conn.target === null) return { edges, replaced: false };
  const kept = edges.filter(
    (e) => !(isLoopEdge(e) && e.source === conn.source),
  );
  const exists = kept.some(
    (e) => isLoopEdge(e) && e.source === conn.source && e.target === conn.target,
  );
  const next: Edge = {
    id: `${LOOP_EDGE_PREFIX}${conn.source}-${conn.target}`,
    source: conn.source,
    target: conn.target,
    style: LOOP_EDGE_STYLE,
  };
  return {
    edges: exists ? kept : [...kept, next],
    replaced: kept.length !== edges.length,
  };
}

/**
 * Loop↔keys correspondence check (PBI-068), run at save after
 * orderStages. A loop edge without a condition is meaningless (the
 * server would ignore the bare loop_target); keys without their edge
 * are an invisible loop; a condition pointing nowhere is a guaranteed
 * 422. All three fail loud naming the stage — never silently pruned.
 * Registry (loop_while), unconditional (loop_always), and router
 * (route) stages are hand-owned and exempt.
 */
export function validateLoops(
  nodes: StageNode[],
  edges: Edge[],
  stageMap: Record<string, StageSpecLike>,
): string | null {
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!isLoopEdge(e)) continue;
    const s = stageMap[e.source];
    if (s === undefined) continue; // orderStages owns missing data
    if (!ids.has(e.target)) {
      return (
        `Stage ${e.source} loops back to deleted stage ${e.target} — ` +
        `redraw the loop-back or remove the loop.`
      );
    }
    if (
      typeof s.loop_condition !== "string" ||
      s.loop_condition.trim() === ""
    ) {
      return (
        `Stage ${e.source} has a loop-back with no condition — ` +
        `add a condition row or delete the dashed edge.`
      );
    }
  }
  for (const n of nodes) {
    const s = stageMap[n.id];
    if (s === undefined) continue;
    if (s.loop_while != null) continue; // registry-owned, exempt
    const cond =
      typeof s.loop_condition === "string" && s.loop_condition.trim() !== ""
        ? s.loop_condition
        : null;
    if (cond === null) continue;
    const target =
      typeof s.loop_target === "string" ? s.loop_target : null;
    if (target === null || !ids.has(target)) {
      return (
        `Stage ${n.id} loops back to unknown stage ${target ?? "(none)"} — ` +
        `redraw the loop-back or remove the loop.`
      );
    }
    const hasEdge = edges.some(
      (e) => isLoopEdge(e) && e.source === n.id,
    );
    if (!hasEdge) {
      return (
        `Stage ${n.id} has a loop condition with no canvas edge — ` +
        `redraw the loop-back or remove the loop.`
      );
    }
  }
  return null;
}
