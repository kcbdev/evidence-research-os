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
}

export type StageNode = Node<StageNodeData, "stage">;

/** Built-in stages, mirroring app/graph/registry.py NODE_REGISTRY. */
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

export function methodologyToFlow(m: MethodologyDetail): {
  nodes: StageNode[];
  edges: Edge[];
} {
  const stages = (m.workflow?.stages ?? []) as StageSpecLike[];
  const nodes: StageNode[] = stages.map((s, i) => ({
    id: s.id,
    type: "stage",
    position: { x: 0, y: i * ROW_H },
    // Explicit dimensions: React Flow skips measuring (no layout flash
    // in production) and renders nodes visible in jsdom, where nothing
    // is ever measured (unmeasured nodes stay visibility:hidden and
    // vanish from role queries).
    width: NODE_W,
    height: NODE_H,
    data: { stageId: s.id, node: s.node, label: stageLabel(s.node) },
  }));
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
