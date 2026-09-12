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
 * Pure — the page reports `replaced` to the user instead of dropping
 * edges silently.
 */
export function connectConstrained(
  edges: Edge[],
  conn: HoverConnection,
): { edges: Edge[]; replaced: boolean } {
  if (conn.source === null || conn.target === null) return { edges, replaced: false };
  const pruned = edges.filter(
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
  return { edges: exists ? pruned : [...pruned, next], replaced: pruned.length !== edges.length };
}

/**
 * Re-link across a deletion batch (PBI-066): surviving entries into
 * the removed closure connect straight to surviving exits. Covers
 * single middle delete, head/tail delete (no bridge), and
 * multi-select block delete with one rule — never silently fork or
 * strand. Pure for the same reason as connectConstrained: jsdom never
 * renders RF edges (EdgeWrapper needs measured handle bounds), so
 * deletion topology is unit-tested here, not through the canvas.
 */
export function bridgeDeletions(edges: Edge[], removedIds: string[]): Edge[] {
  if (removedIds.length === 0) return edges;
  const gone = new Set(removedIds);
  const entries = edges
    .filter((e) => !gone.has(e.source) && gone.has(e.target))
    .map((e) => e.source);
  const exits = edges
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
