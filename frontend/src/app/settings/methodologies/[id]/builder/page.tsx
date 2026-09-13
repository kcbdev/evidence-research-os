"use client";

import {
  Background,
  Controls,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import ModelSelector from "@/components/ModelSelector";
import ConditionBuilder from "@/components/builder/ConditionBuilder";
import CustomCodeCard from "@/components/builder/CustomCodeCard";
import NodePalette from "@/components/builder/NodePalette";
import RoleCard from "@/components/builder/RoleCard";
import RoleEditorDialog from "@/components/builder/RoleEditorDialog";
import StageCard from "@/components/builder/StageCard";
import ValidationToastList, {
  type ServerVerdict,
} from "@/components/builder/ValidationToastList";
import {
  createMethodology,
  dumpMethodologyYaml,
  getMethodology,
  listConditionFields,
  listCustomNodes,
  listPrompts,
  listRoles,
  listSkills,
  listTools,
  parseMethodologyYaml,
  putMethodology,
  setDefaultMethodology,
  validateMethodology,
  type ConditionField,
  type CustomNodeInfo,
  type LibraryRoleEntry,
  type MethodologyDetail,
  type PromptEntry,
  type SkillEntry,
  type ToolRow,
} from "@/lib/api";
import {
  applyLoopConnect,
  bridgeDeletions,
  BUILT_IN_STAGES,
  chainTailId,
  connectConstrained,
  embedDiffers,
  findJudgeOverlaps,
  findUnknownStageNodes,
  ghostToolWarnings,
  handLoopWarnings,
  isLoopEdge,
  LOOP_HANDLE_ID,
  methodologyToFlow,
  nextStageId,
  orderStages,
  stageLabel,
  validateLoops,
  NODE_H,
  NODE_W,
  ROW_H,
  type BuilderNodeKind,
  type LibraryRoleLite,
  type CustomNodeLite,
  type StageNode,
  type StageSpecLike,
} from "@/lib/methodology-graph";

const nodeTypes = { stage: StageCard, role: RoleCard, code: CustomCodeCard };

const ALL_MODES = ["research", "brainstorm", "academic"] as const;

const JUDGE_OVERLAP_TIP =
  "Overlaps the judge model — the server refuses judge/council overlap at save and run time (self-preference bias). Pick a different model for this slot.";

const AUDITOR_OVERLAP_TIP =
  "Overlaps the judge model — the server refuses it at save time even though the auditor sits outside the council rotation. Pick a different model for this slot.";

interface EmbeddedSpec {
  id: string;
  system_prompt: string;
  tools: string[];
  model: string;
  output_schema: string | null;
}

function toEmbedded(entry: LibraryRoleEntry): EmbeddedSpec {
  return {
    id: entry.id,
    system_prompt: entry.system_prompt,
    tools: [...entry.tools],
    model: entry.model,
    output_schema: entry.output_schema,
  };
}

interface ToolbarInputs {
  nodes: StageNode[];
  edges: Edge[];
  stageMap: Record<string, StageSpecLike>;
  methodology: MethodologyDetail | null;
  name: string;
  description: string;
  modes: string[];
  models: Record<string, string>;
  toolsEnabled: string[];
  budget: { max_model_calls: number; max_research_rounds: number };
  toolRows: ToolRow[];
  customNodes: CustomNodeInfo[];
}

/** Canonical doc key (PBI-070): sorted-key stringify, so server key
 * reordering across a save round-trip never reads as dirty. */
export function docKeyFor(doc: unknown): string {
  return stableKey(doc);
}

function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableKey(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Full client validation over live canvas + tab state (PBI-070,
 * shared by Validate and Save): chain walk, loop↔keys
 * correspondence, unknown stage refs, judge overlap; plus amber
 * warnings (hand-owned loops, off-registry enables) that never block.
 */
export function validateToolbarInputs(inp: ToolbarInputs): {
  errors: string[];
  warnings: string[];
} {
  const ordered = orderStages(inp.nodes, inp.edges, inp.stageMap);
  if ("error" in ordered) return { errors: [ordered.error], warnings: [] };
  const loopError = validateLoops(inp.nodes, inp.edges, inp.stageMap);
  const errors: string[] = loopError !== null ? [loopError] : [];
  const known = new Set([
    ...BUILT_IN_STAGES.map((s) => s.node),
    ...((inp.methodology?.custom_roles ?? []).map((r) => r.id)),
    ...inp.customNodes
      .filter((c) => c.node_id !== null && c.load_error === null)
      .map((c) => c.node_id as string),
  ]);
  for (const u of findUnknownStageNodes(ordered.stages, known)) {
    errors.push(
      `Stage ${u.id} uses unknown node '${u.node}' — place it from the palette or fix the reference.`,
    );
  }
  for (const slot of findJudgeOverlaps(inp.models)) {
    errors.push(
      `Model overlap: role slot '${slot}' matches the judge — the server will refuse.`,
    );
  }
  const warnings = [
    ...handLoopWarnings(ordered.stages),
    ...ghostToolWarnings(
      inp.toolsEnabled,
      inp.toolRows.map((t) => t.name),
    ),
  ];
  return { errors, warnings };
}

/**
 * The single save-document constructor (PBI-070): canvas chain +
 * tab states + pruned embeds. Validate, Save, Export, and Duplicate
 * all build through here — no second save path.
 */
export function buildToolbarDoc(inp: ToolbarInputs): {
  doc: Record<string, unknown>;
  warnings: string[];
} {
  // validateToolbarInputs is the single error source (order → loops
  // → refs → overlap); the walk below cannot fail after it passes.
  const v = validateToolbarInputs(inp);
  if (v.errors.length > 0) throw new Error(v.errors[0]);
  const ordered = orderStages(inp.nodes, inp.edges, inp.stageMap);
  if ("error" in ordered) throw new Error(ordered.error);
  const usedRoles = new Set(ordered.stages.map((s) => s.node));
  return {
    doc: {
      ...(inp.methodology ?? {}),
      name: inp.name,
      description: inp.description,
      compatible_modes: inp.modes,
      models: inp.models,
      tools: { enabled: inp.toolsEnabled },
      budget_defaults: inp.budget,
      custom_roles: ((inp.methodology?.custom_roles ?? []) as EmbeddedSpec[]).filter(
        (r) => usedRoles.has(r.id),
      ),
      workflow: { stages: ordered.stages },
    },
    warnings: v.warnings,
  };
}

export default function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [methodology, setMethodology] = useState<MethodologyDetail | null>(null);
  const [nodes, setNodes] = useState<StageNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [stageMap, setStageMap] = useState<Record<string, StageSpecLike>>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [modes, setModes] = useState<string[]>([]);
  // Tab state (PBI-069): Roles/Tools/Budget tabs read and write these;
  // Save carries them in the same PUT as the canvas (no second path).
  const [models, setModels] = useState<Record<string, string>>({});
  const [toolsEnabled, setToolsEnabled] = useState<string[]>([]);
  const [budget, setBudget] = useState({ max_model_calls: 50, max_research_rounds: 5 });
  // Toolbar validation (PBI-070): explicit Validate runs client
  // checks over the live canvas plus the server verdict on the STORED
  // document. Save stays disabled until a client pass on the current
  // key (any edit stales it — re-validate to re-enable).
  const [lastValidation, setLastValidation] = useState<{
    key: string;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [serverVerdict, setServerVerdict] = useState<ServerVerdict | null>(null);
  const [validating, setValidating] = useState(false);
  // Overflow dialogs.
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateId, setDuplicateId] = useState("");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("workflow");
  const [notice, setNotice] = useState<string | null>(null);

  // Library data for palette + inspector.
  const [libraryRoles, setLibraryRoles] = useState<LibraryRoleEntry[]>([]);
  const [rolePrompts, setRolePrompts] = useState<PromptEntry[]>([]);
  const [roleSkills, setRoleSkills] = useState<SkillEntry[]>([]);
  const [toolRows, setToolRows] = useState<ToolRow[]>([]);
  const [customNodes, setCustomNodes] = useState<CustomNodeInfo[]>([]);
  // Condition-field reference data for the Condition Builder (PBI-068).
  const [conditionFields, setConditionFields] = useState<ConditionField[]>([]);

  // Role editor dialog (canvas create flow + library edit flow).
  const [roleDialog, setRoleDialog] = useState<{
    initial: LibraryRoleEntry | "new";
    placeAfterSave: boolean;
  } | null>(null);

  // "Has local overrides" is DERIVED (embed vs library), never
  // tracked: derivation survives reloads, entry switches, and deletes,
  // which flag-tracking cannot (PBI-067 review).
  const [modelOverrideOn, setModelOverrideOn] = useState(false);
  const [modelValue, setModelValue] = useState("");
  const [toolsOverrideOn, setToolsOverrideOn] = useState(false);
  const [toolsValue, setToolsValue] = useState<string[]>([]);

  // Resizable inspector (PBI-066 deferral, owned here).
  const [sheetWidth, setSheetWidth] = useState(420);
  const dragStart = useRef<{ x: number; w: number } | null>(null);

  // Copy-path feedback.
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  // Document → canvas state (PBI-070 extraction): the load effect
  // and Import YAML share this. Defensive fallbacks keep a
  // hand-shaped document loadable (save-time validation judges it).
  function loadDocIntoState(
    doc: MethodologyDetail,
    roles: LibraryRoleLite[],
    codes: CustomNodeLite[],
  ) {
    setMethodology(doc);
    setName(doc.name ?? "");
    setDescription(doc.description ?? "");
    setModes(doc.compatible_modes ?? []);
    setModels({ ...(doc.models ?? {}) });
    setToolsEnabled([...(doc.tools?.enabled ?? [])]);
    setBudget({
      max_model_calls: doc.budget_defaults?.max_model_calls ?? 50,
      max_research_rounds: doc.budget_defaults?.max_research_rounds ?? 5,
    });
    const map: Record<string, StageSpecLike> = {};
    for (const s of (doc.workflow?.stages ?? []) as StageSpecLike[]) {
      map[s.id] = s;
    }
    setStageMap(map);
    const flow = methodologyToFlow(doc, roles, codes);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    return { map, flow };
  }

  function liteRoles(roles: LibraryRoleEntry[]): LibraryRoleLite[] {
    return roles.map((r) => ({ id: r.id, name: r.name, model: r.model, tools: r.tools }));
  }

  function liteCodes(codes: CustomNodeInfo[]): CustomNodeLite[] {
    return codes
      .filter((c) => c.node_id !== null && c.load_error === null)
      .map((c) => ({
        node_id: c.node_id as string,
        filename: c.filename,
        description: c.description,
      }));
  }

  useEffect(() => {
    async function load() {
      try {
        const [m, roles, codes, pr, sk, to, cf] = await Promise.all([
          getMethodology(id),
          listRoles(),
          listCustomNodes(),
          listPrompts(),
          listSkills(),
          listTools(),
          listConditionFields(),
        ]);
        setLibraryRoles(roles);
        setRolePrompts(pr);
        setRoleSkills(sk);
        setToolRows(to);
        setCustomNodes(codes);
        setConditionFields(cf);
        loadDocIntoState(m, liteRoles(roles), liteCodes(codes));
        // No fresh-load auto-validation: per the PBI directive Save
        // stays disabled until an explicit Validate passes, even when
        // the loaded doc would pass (the Validate click also fetches
        // the server verdict on the stored doc — informational, but
        // part of the ceremony). Any edit stales the key afterwards.
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "failed to load");
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Live mirror of edges for callbacks that must not close over stale
  // state (onConnect runs outside the render cycle).
  const lastEdgesRef = useRef<Edge[]>([]);
  useEffect(() => {
    lastEdgesRef.current = edges;
  }, [edges]);
  // Same staleness problem for stageMap in onConnect's loop branch.
  const lastStageMapRef = useRef<Record<string, StageSpecLike>>({});
  useEffect(() => {
    lastStageMapRef.current = stageMap;
  }, [stageMap]);
  // The Saved indicator is only true for the exact saved state.
  // nodes/edges/name/modes cover structural edits; embed and flag
  // mutations clear it explicitly at their call sites (a deps entry on
  // methodology/stageMap would clobber the post-save Saved=true, since
  // save itself resyncs both). PBI-070's Validate-gating builds on this.
  // Tab edits (description/models/tools/budget) join the same contract.
  useEffect(() => {
    setSaved(false);
  }, [nodes, edges, name, description, modes, models, toolsEnabled, budget]);

  const onNodesChange = useCallback(
    (changes: NodeChange<StageNode>[]) => {
      const removed = changes
        .filter((c) => c.type === "remove")
        .map((c) => (c as { id: string }).id);
      setNodes((ns) => applyNodeChanges(changes, ns));
      if (removed.length > 0) {
        // Compute from render-scope `edges` (the PRE-removal image):
        // RF fires its own edge removals concurrently, so the setEdges
        // updater arg is already post-removal and bridgeDeletions would
        // see no entries. Render scope is always pre-removal here
        // because this handler applies the removal itself.
        setEdges(bridgeDeletions(edges, removed));
        // Drop orphaned stage data with the nodes: the inspector must
        // never read a deleted stage back.
        setStageMap((m) => {
          const next = { ...m };
          for (const rid of removed) delete next[rid];
          // Loops into a deleted stage cannot survive (their target is
          // gone): clear the keys now with a notice, or every later
          // save 422s on an unrecoverable target.
          for (const [sid, s] of Object.entries(next)) {
            if (
              typeof s.loop_target === "string" &&
              removed.includes(s.loop_target)
            ) {
              const cleared = { ...s };
              delete cleared.loop_target;
              delete cleared.loop_condition;
              next[sid] = cleared;
            }
          }
          return next;
        });
        // Render-scope stageMap for the notice (same pre-removal image).
        const beheaded = Object.values(stageMap).filter(
          (s) =>
            !removed.includes(s.id) &&
            typeof s.loop_target === "string" &&
            removed.includes(s.loop_target),
        );
        if (beheaded.length > 0) {
          setNotice(
            `Removed loop-backs pointing at deleted stages (${beheaded.map((s) => s.id).join(", ")}).`,
          );
        }
        const gone = new Set(removed);
        setSelectedId((sel) => (sel !== null && gone.has(sel) ? null : sel));
      }
    },
    [edges, stageMap],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);

  // Sequential-only canvas: one chain. A new connection replaces any
  // existing edge out of the source or into the target, and says so —
  // edges must never vanish magically. Drags from the amber loop
  // handle (PBI-068) instead create/replace the stage's dashed
  // loop-back and open its Condition Builder.
  const onConnect = useCallback((conn: Connection) => {
    if (conn.sourceHandle === LOOP_HANDLE_ID) {
      // Pure transition (tested in methodology-graph.test.ts): the
      // page only applies the returned state. A loop-back without a
      // condition is meaningless, so the source inspector opens
      // straight at the Condition Builder.
      const r = applyLoopConnect(lastEdgesRef.current, lastStageMapRef.current, {
        source: conn.source,
        target: conn.target,
      });
      setEdges(r.edges);
      setStageMap(r.stageMap);
      setSaved(false);
      if (r.selectId !== null) setSelectedId(r.selectId);
      setNotice(r.notice);
      return;
    }
    const { edges: next, replaced } = connectConstrained(
      // read current edges via setState updater to avoid stale closures
      lastEdgesRef.current,
      { source: conn.source, target: conn.target },
    );
    setEdges(next);
    setNotice(
      replaced
        ? "Replaced the existing link — normal handles stay sequential; loop-backs start at the amber handle."
        : null,
    );
  }, []);

  // Selecting a dashed loop-back opens its source stage's inspector
  // (the Condition Builder lives there).
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (isLoopEdge(edge)) setSelectedId(edge.source);
  }, []);

  function addNode(node: string) {
    addStageNode(nextStageId(node, new Set(nodes.map((n) => n.id))), node, {
      kind: "stage",
      label: stageLabel(node),
    });
  }

  function addStageNode(
    stageId: string,
    node: string,
    data: { kind: BuilderNodeKind; label: string } & Record<string, unknown>,
  ) {
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), -ROW_H);
    setStageMap((m) => ({ ...m, [stageId]: { id: stageId, node } }));
    setNodes((ns) => [
      ...ns,
      {
        id: stageId,
        type: data.kind,
        position: { x: 0, y: maxY + ROW_H },
        width: NODE_W,
        height: NODE_H,
        data: { stageId, node, ...data },
      },
    ]);
    // Appending extends the chain: a single tail connects straight to
    // the new node. Multiple tails (or none) leave the node floating —
    // save validation names it instead of guessing. Loop edges are not
    // chain links (chainTailId ignores them): a looped tail still
    // extends, or appended nodes strand after every loop is drawn.
    const tail = chainTailId(nodes, edges);
    if (tail !== null) {
      setEdges((es) => [...es, { id: `e-${tail}-${stageId}`, source: tail, target: stageId }]);
    }
  }

  function upsertEmbedded(entry: LibraryRoleEntry) {
    const spec = toEmbedded(entry);
    // Asymmetry accepted: the library save gates tool names, but this
    // embed path does not re-check them (the UI only offers registry
    // rows; hand-built payloads fail later at compile, same as today).
    setMethodology((m) =>
      m === null
        ? m
        : {
            ...m,
            custom_roles: [...(m.custom_roles ?? []).filter((r) => r.id !== spec.id), spec],
          },
    );
  }

  function refreshRoleNode(stageId: string, roleId: string, entry: LibraryRoleEntry) {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === stageId
          ? {
              ...n,
              data: {
                ...n.data,
                node: roleId,
                label: entry.name,
                roleName: entry.name,
                model: entry.model,
                toolCount: entry.tools.length,
              },
            }
          : n,
      ),
    );
  }

  function placeRole(roleId: string) {
    const entry = libraryRoles.find((r) => r.id === roleId);
    if (entry) placeRoleEntry(entry);
  }

  function placeRoleEntry(entry: LibraryRoleEntry) {
    if (entry.model.trim() === "") {
      // Placement is the run path: an empty model would 400 at run
      // time with no gate anywhere downstream. The library tolerates
      // drafts; the canvas demands runnable entries.
      setNotice(`Role ${entry.id} has no model set — set one in the Roles library before placing it.`);
      return;
    }
    upsertEmbedded(entry);
    const stageId = nextStageId(entry.id, new Set(nodes.map((n) => n.id)));
    addStageNode(stageId, entry.id, {
      kind: "role",
      label: entry.name,
      roleName: entry.name,
      model: entry.model,
      toolCount: entry.tools.length,
    });
  }

  function placeCode(nodeId: string) {
    const info = customNodes.find((c) => c.node_id === nodeId);
    const stageId = nextStageId(nodeId, new Set(nodes.map((n) => n.id)));
    addStageNode(stageId, nodeId, {
      kind: "code",
      label: info?.filename ?? nodeId,
      filename: info?.filename ?? nodeId,
      fileDescription: info?.description ?? "",
    });
  }

  function toggleMode(mode: string) {
    setModes((ms) => (ms.includes(mode) ? ms.filter((m) => m !== mode) : [...ms, mode]));
  }

  // Render-scope inputs for the single doc constructor below.
  function toolbarInputs(): ToolbarInputs {
    return {
      nodes,
      edges,
      stageMap,
      methodology,
      name,
      description,
      modes,
      models,
      toolsEnabled,
      budget,
      toolRows,
      customNodes,
    };
  }

  // Current canvas validation, recomputed every render (pure walks
  // over a small graph — cheaper than tracking dirty flags that miss
  // a mutation path). Save reads freshness off this.
  function currentValidation(): { key: string; errors: string[]; warnings: string[] } {
    try {
      const built = buildToolbarDoc(toolbarInputs());
      return { key: docKeyFor(built.doc), errors: [], warnings: built.warnings };
    } catch (err: unknown) {
      const v = validateToolbarInputs(toolbarInputs());
      return { key: "", errors: v.errors, warnings: v.warnings };
    }
  }

  async function onValidate() {
    if (methodology === null) return;
    setValidating(true);
    try {
      const inp = toolbarInputs();
      const v = validateToolbarInputs(inp);
      if (v.errors.length > 0) {
        // No key (unmatchable): Save stays disabled until fixed.
        setLastValidation({ key: "", errors: v.errors, warnings: v.warnings });
        toast.error(`Validation failed: ${v.errors.length} issue${v.errors.length === 1 ? "" : "s"}.`);
      } else {
        const built = buildToolbarDoc(inp);
        setLastValidation({
          key: docKeyFor(built.doc),
          errors: [],
          warnings: built.warnings,
        });
        if (built.warnings.length > 0) {
          toast.warning(
            `Validation passed with ${built.warnings.length} warning${built.warnings.length === 1 ? "" : "s"}.`,
          );
        } else {
          toast.success("Validation passed.");
        }
      }
      // Server verdict judges the STORED document, never unsaved
      // canvas state — informational until the next save (whose 422s
      // still surface verbatim).
      try {
        await validateMethodology(id);
        setServerVerdict({ ok: true, detail: null });
        toast.success("Server: saved document valid.");
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : "validate failed";
        setServerVerdict({ ok: false, detail });
        toast.error(`Server validation failed: ${detail}`);
      }
    } finally {
      setValidating(false);
    }
  }

  async function onSave() {
    if (methodology === null) return;
    // Client pre-checks (chain, loops, refs, overlap) fail loud
    // naming the stage — the server 422 is the backstop, not the
    // messenger. Prune orphan embeds (deleted/retargeted role nodes):
    // the PUT carries only what the saved stages reference.
    let built: { doc: Record<string, unknown>; warnings: string[] };
    try {
      built = buildToolbarDoc(toolbarInputs());
    } catch (err: unknown) {
      setSaved(false);
      setError(err instanceof Error ? err.message : "save failed");
      return;
    }
    const key = docKeyFor(built.doc);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const savedDoc = await putMethodology(id, built.doc);
      setMethodology(savedDoc);
      // Resync stage data from the server-normalized document — the
      // local map still holds minimal pre-save shapes for added nodes.
      // Tab states (description/models/tools/budget) are NOT resynced:
      // the PUT carries them verbatim and the Saved-hygiene effect
      // above keys on their references — resyncing would mint fresh
      // objects and clobber the post-save Saved=true, exactly the
      // methodology/stageMap hazard documented there. The canonical
      // doc key (sorted keys) survives the round-trip either way.
      const map: Record<string, StageSpecLike> = {};
      for (const s of (savedDoc.workflow?.stages ?? []) as StageSpecLike[]) {
        map[s.id] = s;
      }
      setStageMap(map);
      setSaved(true);
      // Canvas now equals stored: validation is fresh without
      // re-running (same canonical key the next render computes).
      setLastValidation({ key, errors: [], warnings: built.warnings });
      toast.success("Saved.");
    } catch (err) {
      setSaved(false);
      const detail = err instanceof Error ? err.message : "save failed";
      setError(detail);
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  }

  const selected =
    selectedId !== null ? (nodes.find((n) => n.id === selectedId) ?? null) : null;
  // Tab derivations (PBI-069): council slots overlapping the judge
  // (red rows; the server still refuses at save — defense in depth)
  // and enables outside the tool registry (kept, shown muted).
  const overlaps = findJudgeOverlaps(models);
  const extraEnables = toolsEnabled.filter(
    (n) => !toolRows.some((t) => t.name === n),
  );
  const selectedStage = selected !== null ? (stageMap[selected.id] ?? null) : null;
  const selectedEmbedded =
    selected !== null && selected.data.kind === "role"
      ? ((methodology?.custom_roles ?? []).find((r) => r.id === selected.data.node) ?? null)
      : null;
  const selectedLibrary =
    selected !== null && selected.data.kind === "role"
      ? (libraryRoles.find((r) => r.id === selected.data.node) ?? null)
      : null;
  const selectedCode =
    selected !== null && selected.data.kind === "code"
      ? (customNodes.find((c) => c.node_id === selected.data.node) ?? null)
      : null;
  // Loop state (PBI-068): the Condition Builder shows when the stage
  // owns a dashed loop edge or a loop_condition; registry
  // (loop_while), unconditional (loop_always), and router (route)
  // stages are hand-owned (note, never drawn, never rewritten).
  const selectedLoopEdge =
    selected !== null
      ? edges.find((e) => isLoopEdge(e) && e.source === selected.id)
      : undefined;
  const selectedLoopCondition =
    selectedStage !== null &&
    typeof selectedStage.loop_condition === "string" &&
    selectedStage.loop_condition.trim() !== ""
      ? selectedStage.loop_condition
      : null;
  const selectedLoopWhile =
    selectedStage !== null && typeof selectedStage.loop_while === "string"
      ? selectedStage.loop_while
      : null;
  const selectedLoopTarget =
    selectedLoopEdge?.target ??
    (selectedStage !== null && typeof selectedStage.loop_target === "string"
      ? selectedStage.loop_target
      : null);
  const handLoopForms =
    selectedStage !== null &&
    selectedLoopCondition === null &&
    selectedLoopEdge === undefined
      ? (["loop_while", "loop_always", "route"] as const).filter(
          (f) => selectedStage[f] != null,
        )
      : [];
  const isCustomized =
    selected !== null &&
    selected.data.kind === "role" &&
    selectedEmbedded !== null &&
    embedDiffers(
      { model: selectedEmbedded.model, tools: selectedEmbedded.tools },
      selectedLibrary !== null
        ? { model: selectedLibrary.model, tools: selectedLibrary.tools }
        : undefined,
    );

  // Reset override drafting whenever the selection changes.
  useEffect(() => {
    if (selectedEmbedded !== null) {
      setModelOverrideOn(false);
      setModelValue(selectedEmbedded.model);
      setToolsOverrideOn(false);
      setToolsValue([...selectedEmbedded.tools]);
    }
    setCopied(false);
    setCopyError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function applyRoleOverride(patch: Partial<EmbeddedSpec>) {
    if (selected === null || selectedEmbedded === null) return;
    if (patch.model !== undefined && patch.model.trim() === "") {
      // The empty-model "inherit" marker has no runtime resolution
      // anywhere (no compiler/backend/UI path resolves it) — a run
      // would 400 on an empty model id. Refuse, don't file a bomb.
      setNotice("Empty model refused — set a real model id, or leave the override off to keep the embedded one.");
      return;
    }
    setSaved(false);
    const next: EmbeddedSpec = { ...selectedEmbedded, ...patch };
    setMethodology((m) =>
      m === null
        ? m
        : {
            ...m,
            custom_roles: (m.custom_roles ?? []).map((r) => (r.id === next.id ? next : r)),
          },
    );
    // Overrides apply to the shared embed: every node using this role
    // updates together, so badges can never diverge.
    setNodes((ns) =>
      ns.map((n) =>
        n.data.kind === "role" && n.data.node === next.id
          ? { ...n, data: { ...n.data, model: next.model, toolCount: next.tools.length } }
          : n,
      ),
    );
  }

  function switchRoleEntry(roleId: string) {
    const entry = libraryRoles.find((r) => r.id === roleId);
    if (!entry || selected === null) return;
    if (entry.model.trim() === "") {
      setNotice(`Role ${entry.id} has no model set — set one in the Roles library before using it here.`);
      return;
    }
    // Switching entries re-embeds a fresh snapshot (local overrides do
    // not carry across entries) and retargets the stage — preserving
    // every other stage key (interrupt, loop/route forms).
    upsertEmbedded(entry);
    setSaved(false);
    setStageMap((m) => ({ ...m, [selected.id]: { ...m[selected.id], id: selected.id, node: roleId } }));
    refreshRoleNode(selected.id, roleId, entry);
    setModelOverrideOn(false);
    setModelValue(entry.model);
    setToolsOverrideOn(false);
    setToolsValue([...entry.tools]);
  }

  function updateLoopCondition(stageId: string, expr: string | null) {
    // Writes the compiled simpleeval string straight onto the stage:
    // the Condition Builder is a thin view over loop_condition.
    setSaved(false);
    setStageMap((m) => {
      const cur = m[stageId];
      if (!cur) return m;
      const next = { ...cur };
      if (expr === null) delete next.loop_condition;
      else next.loop_condition = expr;
      return { ...m, [stageId]: next };
    });
  }

  function removeLoop(stageId: string) {
    // One gesture clears keys AND the canvas edge together: keys
    // without their edge would be an invisible loop, an edge without
    // keys a meaningless one. Save-time validateLoops guards any other
    // path that splits them.
    setSaved(false);
    setStageMap((m) => {
      const cur = m[stageId];
      if (!cur) return m;
      const next = { ...cur };
      delete next.loop_condition;
      delete next.loop_target;
      return { ...m, [stageId]: next };
    });
    setEdges((es) => es.filter((e) => !(isLoopEdge(e) && e.source === stageId)));
    setNotice("Loop-back removed.");
  }

  // Save gating (PBI-070): Save stays disabled until a client pass on
  // the exact current key. Edits stale the key; Validate refreshes it.
  const current = currentValidation();
  const saveBlockReason =
    saving || validating
      ? "Working…"
      : methodology === null
        ? "Loading…"
        : lastValidation === null
          ? "Run Validate first."
          : lastValidation.key !== current.key
            ? "Canvas changed since validation — re-run Validate."
            : lastValidation.errors.length > 0
              ? lastValidation.errors[0]
              : null;
  const saveBlocked = saveBlockReason !== null;

  async function onConfirmDefault() {
    setDefaultOpen(false);
    setError(null);
    try {
      await setDefaultMethodology(id);
      // Other methodologies sharing a mode lose the flag server-side;
      // this page only ever shows one doc, so mark it directly.
      setMethodology((m) => (m === null ? m : { ...m, is_default: true }));
      setNotice("Set as the default methodology.");
      toast.success("Set as the default methodology.");
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "set-default failed";
      setError(detail);
      toast.error(detail);
    }
  }

  function openDuplicate() {
    setDuplicateId(`${id}-copy`);
    setDuplicateError(null);
    setDuplicateOpen(true);
  }

  async function onConfirmDuplicate() {
    const newId = duplicateId.trim();
    if (newId === "") {
      setDuplicateError("Give the copy an id.");
      return;
    }
    let built: { doc: Record<string, unknown>; warnings: string[] };
    try {
      built = buildToolbarDoc(toolbarInputs());
    } catch (err: unknown) {
      // Duplicating a broken canvas is refused (no broken copies filed).
      setDuplicateError(err instanceof Error ? err.message : "invalid canvas");
      return;
    }
    // Deep copy through JSON (methodology docs are JSON-safe): later
    // edits to the copy can never alias the original's refs.
    const copy = JSON.parse(JSON.stringify(built.doc)) as Record<string, unknown>;
    copy.id = newId;
    copy.name = `${typeof copy.name === "string" && copy.name !== "" ? copy.name : newId} (copy)`;
    copy.is_default = false;
    setDuplicating(true);
    setDuplicateError(null);
    try {
      const created = await createMethodology(copy);
      setDuplicateOpen(false);
      toast.success(`Duplicated as ${created.id}.`);
      router.push(`/settings/methodologies/${created.id}/builder`);
    } catch (err: unknown) {
      // 409 (id taken) et al keep the dialog open for a retry.
      setDuplicateError(err instanceof Error ? err.message : "duplicate failed");
    } finally {
      setDuplicating(false);
    }
  }

  async function openExport() {
    setExportCopied(false);
    try {
      const built = buildToolbarDoc(toolbarInputs());
      setExportError(null);
      setExportText(await dumpMethodologyYaml(built.doc));
    } catch (err: unknown) {
      // Read-only inspection stays available for broken canvases only
      // as the error naming what to fix — YAML of an unsavable doc
      // would be a trap, not an escape hatch.
      setExportText(null);
      setExportError(err instanceof Error ? err.message : "invalid canvas");
    }
    setExportOpen(true);
  }

  async function copyExport() {
    if (exportText === null) return;
    setExportCopied(false);
    try {
      await navigator.clipboard.writeText(exportText);
      setExportCopied(true);
    } catch {
      setExportCopied(false);
    }
  }

  async function onImportApply() {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = await parseMethodologyYaml(importText);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "parse failed");
      return;
    }
    const doc = parsed as Record<string, unknown>;
    const stages = (doc?.workflow as { stages?: unknown } | undefined)?.stages;
    if (doc === null || typeof doc !== "object" || !Array.isArray(stages)) {
      setImportError("Import needs a methodology document with workflow.stages.");
      return;
    }
    const foreignId = typeof doc.id === "string" ? doc.id : null;
    // The canvas always saves into THIS methodology: a foreign id
    // cannot survive the PUT (body id must match path), so say so
    // instead of silently keeping or dropping it.
    const detail = doc as unknown as MethodologyDetail;
    loadDocIntoState(
      { ...detail, id },
      liteRoles(libraryRoles),
      liteCodes(customNodes),
    );
    setSelectedId(null);
    setLastValidation(null);
    setServerVerdict(null);
    setImportOpen(false);
    setImportText("");
    setNotice(
      foreignId !== null && foreignId !== id
        ? `Imported ${stages.length} stages (document id '${foreignId}' ignored — saving into this methodology). Validate, then Save.`
        : `Imported ${stages.length} stages — Validate, then Save.`,
    );
  }

  async function copyPath(text: string) {
    setCopied(false);
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopyError("Copy failed — select the path manually.");
    }
  }

  function onSheetResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    dragStart.current = { x: e.clientX, w: sheetWidth };
    const onMove = (ev: MouseEvent) => {
      if (dragStart.current === null) return;
      const next = dragStart.current.w + (dragStart.current.x - ev.clientX);
      setSheetWidth(Math.min(720, Math.max(320, next)));
    };
    const onUp = () => {
      dragStart.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings/methodologies" className="text-sm underline">
            ← Methodologies
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              aria-label="Methodology name"
              className="min-h-[44px] max-w-md text-2xl font-semibold"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Compatible:</span>
            {modes.map((m) => (
              <Badge key={m}>{m}</Badge>
            ))}
            {ALL_MODES.filter((m) => !modes.includes(m)).map((m) => (
              <Button
                key={m}
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                aria-label={`Add mode ${m}`}
                onClick={() => toggleMode(m)}
              >
                + {m}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={validating || methodology === null}
            onClick={() => void onValidate()}
          >
            {validating ? "Validating…" : "Validate"}
          </Button>
          <Button
            className="min-h-[44px]"
            disabled={saveBlocked}
            title={saveBlockReason ?? undefined}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={methodology === null}
            onClick={() => setDefaultOpen(true)}
          >
            Set as default
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="More actions"
                  className="min-h-[44px] min-w-[44px]"
                >
                  <MoreVertical className="size-4" aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openDuplicate()}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void openExport()}>
                Export YAML
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setImportText("");
                  setImportError(null);
                  setImportOpen(true);
                }}
              >
                Import YAML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {methodology !== null && (
        <ValidationToastList
          errors={lastValidation?.errors ?? null}
          warnings={lastValidation?.warnings ?? []}
          server={serverVerdict}
        />
      )}

      {methodology === null && !error ? (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-16" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        methodology !== null && (
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4 lg:flex-row">
            <TabsList className="flex h-auto flex-row gap-1 overflow-x-auto lg:flex-col lg:items-stretch">
              <TabsTrigger value="workflow" className="min-h-[44px] lg:justify-start">
                Workflow
              </TabsTrigger>
              <TabsTrigger value="roles" className="min-h-[44px] lg:justify-start">
                Roles
              </TabsTrigger>
              <TabsTrigger value="tools" className="min-h-[44px] lg:justify-start">
                Tools
              </TabsTrigger>
              <TabsTrigger value="budget" className="min-h-[44px] lg:justify-start">
                Budget
              </TabsTrigger>
              <TabsTrigger value="metadata" className="min-h-[44px] lg:justify-start">
                Metadata
              </TabsTrigger>
            </TabsList>
            <TabsContent value="workflow" className="relative min-h-[60vh] flex-1 rounded border">
              <p className="px-3 pt-2 text-xs text-muted-foreground">
                Chain plus loop-backs — drag between handles to reconnect
                (replaces the existing link); drag from the amber loop
                handle to add a conditional loop-back.
              </p>
              <div className="h-[55vh]">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                onEdgeClick={onEdgeClick}
                deleteKeyCode={["Backspace", "Delete"]}
                colorMode="dark"
                fitView
              >
                <Background />
                {/* Viewport controls only (zoom/fit) — the methodology
                    toolbar (Validate/Save/Set-Default) is PBI-070. */}
                <Controls />
              </ReactFlow>
              </div>
              <Button
                size="icon"
                aria-label="Add node"
                className="absolute right-4 bottom-4 min-h-[44px] min-w-[44px]"
                onClick={() => setPaletteOpen(true)}
              >
                +
              </Button>
            </TabsContent>
            {(["roles", "tools", "budget", "metadata"] as const).map((t) => (
              <TabsContent key={t} value={t} className="flex-1">
                {t === "roles" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      Model per role slot. Slots matching the judge are
                      refused by the server (self-preference bias) — fix
                      them here before saving.
                    </p>
                    {!("judge" in models) && (
                      <p className="text-xs text-muted-foreground">
                        No judge slot — the compiler requires one.
                      </p>
                    )}
                    {Object.keys(models).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No model slots in this methodology.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Slot</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(models).map(([slot, current]) => {
                            const overlapped = overlaps.includes(slot);
                            return (
                              <TableRow
                                key={slot}
                                className={overlapped ? "bg-destructive/10" : undefined}
                              >
                                <TableCell className="font-mono">
                                  {slot}
                                  {slot === "auditor" && (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      not council
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <ModelSelector
                                    label={`Model for ${slot}`}
                                    value={current}
                                    onChange={(v) =>
                                      setModels((ms) => ({ ...ms, [slot]: v }))
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  {overlapped ? (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="destructive">
                                        Overlaps judge
                                      </Badge>
                                      <Tooltip>
                                        <TooltipTrigger
                                          render={
                                            <button
                                              type="button"
                                              className="min-h-[44px] px-2 text-sm underline"
                                            >
                                              Why?
                                            </button>
                                          }
                                        />
                                        <TooltipContent>
                                          {slot === "auditor"
                                            ? AUDITOR_OVERLAP_TIP
                                            : JUDGE_OVERLAP_TIP}
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
                {t === "tools" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      Methodology-global enables. Role nodes may restrict
                      but never expand this set.
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {toolRows.map((tool) => (
                        <label
                          key={tool.name}
                          className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded border px-2 text-sm"
                        >
                          <Checkbox
                            checked={toolsEnabled.includes(tool.name)}
                            onCheckedChange={() => {
                              setToolsEnabled((es) =>
                                es.includes(tool.name)
                                  ? es.filter((x) => x !== tool.name)
                                  : [...es, tool.name],
                              );
                            }}
                          />
                          <span className="font-mono">{tool.name}</span>
                        </label>
                      ))}
                    </div>
                    {toolRows.length > 0 && extraEnables.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {`Kept on save (not in the registry): ${extraEnables.join(", ")} — remove names via Import/Export (PBI-070).`}
                      </p>
                    )}
                  </div>
                )}
                {t === "budget" && (
                  <form
                    className="flex max-w-md flex-col gap-3"
                    onSubmit={(e) => e.preventDefault()}
                  >
                    <div className="flex flex-col gap-1">
                      <label htmlFor="budget-calls" className="text-sm font-medium">
                        Max model calls
                      </label>
                      <Input
                        id="budget-calls"
                        type="number"
                        min={1}
                        className="min-h-[44px]"
                        value={budget.max_model_calls}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          // Budgets are positive ints (positive by the
                          // settings-budget contract; the methodology
                          // schema itself is bare ints, so the tab holds
                          // the floor instead of persisting nonsense).
                          if (!Number.isNaN(n) && n >= 1) {
                            setBudget((b) => ({ ...b, max_model_calls: n }));
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="budget-rounds" className="text-sm font-medium">
                        Max research rounds
                      </label>
                      <Input
                        id="budget-rounds"
                        type="number"
                        min={1}
                        className="min-h-[44px]"
                        value={budget.max_research_rounds}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          if (!Number.isNaN(n) && n >= 1) {
                            setBudget((b) => ({ ...b, max_research_rounds: n }));
                          }
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Per-run source caps live in per-project Settings,
                      not in the methodology.
                    </p>
                  </form>
                )}
                {t === "metadata" && (
                  <div className="flex max-w-md flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="meta-name" className="text-sm font-medium">
                        Name
                      </label>
                      <Input
                        id="meta-name"
                        className="min-h-[44px]"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="meta-description" className="text-sm font-medium">
                        Description
                      </label>
                      <Textarea
                        id="meta-description"
                        className="min-h-[44px]"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Compatible modes</span>
                      {ALL_MODES.map((m) => (
                        <label
                          key={m}
                          className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={modes.includes(m)}
                            onCheckedChange={() => toggleMode(m)}
                          />
                          {m}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )
      )}

      <NodePalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onPick={addNode}
        roles={libraryRoles}
        customNodes={customNodes}
        onPickRole={(roleId) => placeRole(roleId)}
        onPickCode={(nodeId) => placeCode(nodeId)}
        onCreateRole={() => {
          setPaletteOpen(false);
          setRoleDialog({ initial: "new", placeAfterSave: true });
        }}
      />

      <RoleEditorDialog
        open={roleDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRoleDialog(null);
        }}
        initial={roleDialog?.initial ?? "new"}
        prompts={rolePrompts}
        skills={roleSkills}
        tools={toolRows}
        onSaved={(entry) => {
          setLibraryRoles((rs) => {
            const rest = rs.filter((r) => r.id !== entry.id);
            return [...rest, entry];
          });
          // A library save refreshes canvases referencing the entry —
          // unless the embed carries local overrides (derived, never
          // tracked: survives reloads by construction).
          const embed = (methodology?.custom_roles ?? []).find((r) => r.id === entry.id);
          const referenced = nodes.some(
            (n) => n.data.kind === "role" && n.data.node === entry.id,
          );
          if (referenced) {
            if (embed && embedDiffers(
              { model: embed.model, tools: embed.tools },
              { model: entry.model, tools: entry.tools },
            )) {
              setNotice(
                `Library role ${entry.id} saved — nodes with local overrides kept their methodology copies.`,
              );
            } else {
              upsertEmbedded(entry);
              for (const n of nodes) {
                if (n.data.kind === "role" && n.data.node === entry.id) {
                  refreshRoleNode(n.id, entry.id, entry);
                }
              }
            }
          }
          if (roleDialog?.placeAfterSave) {
            // Place straight from the saved entry (the library list
            // state hasn't refreshed yet — no stale lookup).
            placeRoleEntry(entry);
          }
          setRoleDialog(null);
        }}
      />

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        {/* Inspector: resizable via the left-edge drag handle (PBI-066
            deferral, owned here). */}
        <SheetContent
          style={{ width: sheetWidth, maxWidth: "calc(100vw - 2rem)" }}
          className="sm:max-w-none"
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize inspector"
            className="absolute top-0 left-0 h-full w-2 cursor-ew-resize touch-none"
            onMouseDown={onSheetResizeStart}
          />
          <SheetHeader>
            <SheetTitle>{selected?.data.label ?? "Node"}</SheetTitle>
            <SheetDescription className="font-mono">
              {selected?.data.node}
            </SheetDescription>
          </SheetHeader>
          {selected !== null && selected.data.kind === "stage" && (
            <div className="flex flex-col gap-3 px-4">
              <p className="text-sm text-muted-foreground">
                Built-in stage. {selectedStage !== null && selectedStage.interrupt === true
                  ? "Pauses here for approval."
                  : "Runs straight through."}
              </p>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={(selectedStage?.interrupt as boolean | undefined) === true}
                  onCheckedChange={(v) => {
                    // Omit the default on OFF (schema default false) —
                    // no YAML bloat for untouched stages.
                    setStageMap((m) => {
                      const cur = { ...(m[selected.id] ?? { id: selected.id }) };
                      if (v === true) cur.interrupt = true;
                      else delete cur.interrupt;
                      return { ...m, [selected.id]: cur };
                    });
                    setSaved(false);
                  }}
                />
                Pause here for approval
              </label>
            </div>
          )}
          {selected !== null && selected.data.kind === "role" && (
            <div className="flex flex-col gap-3 px-4">
              <div className="flex flex-col gap-1">
                <span id="inspector-role-label" className="text-sm font-medium">
                  Library entry
                </span>
                <Select
                  value={selected.data.node as string}
                  onValueChange={(v) => {
                    if (v !== null) switchRoleEntry(v);
                  }}
                >
                  <SelectTrigger
                    id="inspector-role"
                    aria-labelledby="inspector-role-label"
                    className="min-h-[44px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {libraryRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
                  <Switch
                    checked={modelOverrideOn}
                    onCheckedChange={(v) => {
                      setModelOverrideOn(v);
                      if (!v) {
                        if (selectedLibrary !== null && selectedLibrary.model.trim() !== "") {
                          // OFF reverts to the library snapshot (F1: hiding
                          // the input must never keep stale values).
                          setModelValue(selectedLibrary.model);
                          applyRoleOverride({ model: selectedLibrary.model });
                        } else {
                          // Library model itself empty: reverting would
                          // just re-file the refused value — stay ON.
                          setModelOverrideOn(true);
                          setNotice("Role has no model in the library — override stays on.");
                        }
                      }
                    }}
                  />
                  Override model for this methodology
                </label>
                {modelOverrideOn && (
                  <>
                    <ModelSelector
                      label="Role model override"
                      value={modelValue}
                      onChange={(v) => {
                        setModelValue(v);
                        applyRoleOverride({ model: v });
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be a real model id — empty is refused (nothing
                      resolves an inherit marker at run time).
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
                  <Switch
                    checked={toolsOverrideOn}
                    onCheckedChange={(v) => {
                      setToolsOverrideOn(v);
                      if (v && selectedEmbedded !== null) {
                        setToolsValue([...selectedEmbedded.tools]);
                      }
                      if (!v && selectedLibrary !== null) {
                        // OFF reverts to the library snapshot.
                        setToolsValue([...selectedLibrary.tools]);
                        applyRoleOverride({ tools: [...selectedLibrary.tools] });
                      }
                    }}
                  />
                  Override tools for this methodology
                </label>
                {toolsOverrideOn && (
                  <div className="grid gap-2">
                    {toolRows.map((t) => (
                      <label
                        key={t.name}
                        className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded border px-2 text-sm"
                      >
                        <Checkbox
                          checked={toolsValue.includes(t.name)}
                          onCheckedChange={() => {
                            const next = toolsValue.includes(t.name)
                              ? toolsValue.filter((x) => x !== t.name)
                              : [...toolsValue, t.name];
                            setToolsValue(next);
                            applyRoleOverride({ tools: next });
                          }}
                        />
                        <span className="font-mono">{t.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {isCustomized && (
                <p className="text-xs text-muted-foreground">
                  Methodology-local overrides active — library edits to this
                  role will not refresh this node.
                </p>
              )}
              {selectedLibrary !== null ? (
                <div>
                  <Button
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={() =>
                      setRoleDialog({ initial: selectedLibrary, placeAfterSave: false })
                    }
                  >
                    Edit this role
                  </Button>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className="ml-2 min-h-[44px] min-w-[44px] px-2 text-sm underline"
                        >
                          Why a warning?
                        </button>
                      }
                    />
                    <TooltipContent>
                      Editing affects all methodologies using this role —
                      except nodes with local overrides, which keep their
                      methodology copies.
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No longer in the library — methodology snapshot only.
                </p>
              )}
            </div>
          )}
          {selected !== null && selected.data.kind === "code" && (
            <div className="px-4">
              <Card>
                <CardHeader>
                  <CardTitle className="font-mono text-sm">
                    {selected.data.filename as string}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="font-mono text-xs text-muted-foreground">
                    NODE_ID: {selected.data.node as string}
                  </p>
                  {(selected.data.fileDescription as string | undefined) && (
                    <p className="text-sm text-muted-foreground">
                      {selected.data.fileDescription as string}
                    </p>
                  )}
                  <div>
                    <Badge variant="outline">Authored in code — edit in your IDE</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                      backend/custom_nodes/{selected.data.filename as string}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() =>
                        void copyPath(`backend/custom_nodes/${selected.data.filename as string}`)
                      }
                    >
                      {copied ? "Copied." : "Copy path"}
                    </Button>
                  </div>
                  {copyError && (
                    <p role="alert" className="text-sm text-destructive">
                      {copyError}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          {selected !== null && selectedStage !== null && (
            <div className="flex flex-col gap-1 px-4">
              <span className="text-sm font-medium">Loop</span>
              {selectedLoopEdge !== undefined || selectedLoopCondition !== null ? (
                <ConditionBuilder
                  key={selected.id}
                  fields={conditionFields}
                  expression={selectedLoopCondition}
                  loopWhile={selectedLoopWhile}
                  loopTarget={selectedLoopTarget}
                  onChange={(expr) => updateLoopCondition(selected.id, expr)}
                  onRemoveLoop={() => removeLoop(selected.id)}
                />
              ) : handLoopForms.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Hand-authored {handLoopForms.join(", ")} — edit via
                  Import/Export; the canvas leaves these keys untouched.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No loop — drag from the amber loop handle onto a stage
                  to repeat while a condition holds.
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={defaultOpen} onOpenChange={setDefaultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set as default?</DialogTitle>
            <DialogDescription>
              Future runs without an explicit methodology will use this.
              This changes real run behavior.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setDefaultOpen(false)}
            >
              Cancel
            </Button>
            <Button className="min-h-[44px]" onClick={() => void onConfirmDefault()}>
              Confirm default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate methodology</DialogTitle>
            <DialogDescription>
              Deep copy under a new id — editing the copy never touches
              the original.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <label htmlFor="duplicate-id" className="text-sm font-medium">
              New id
            </label>
            <Input
              id="duplicate-id"
              className="min-h-[44px] font-mono"
              value={duplicateId}
              onChange={(e) => setDuplicateId(e.target.value)}
            />
          </div>
          {duplicateError && (
            <p role="alert" className="text-sm text-destructive">
              {duplicateError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setDuplicateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="min-h-[44px]"
              disabled={duplicating}
              onClick={() => void onConfirmDuplicate()}
            >
              {duplicating ? "Duplicating…" : "Create copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export YAML</DialogTitle>
            <DialogDescription>
              Canonical text of the current canvas — re-imports
              byte-identical.
            </DialogDescription>
          </DialogHeader>
          {exportError ? (
            <p role="alert" className="text-sm text-destructive">
              {exportError}
            </p>
          ) : (
            <Textarea
              aria-label="Exported methodology YAML"
              className="min-h-[30vh] font-mono text-xs"
              readOnly
              value={exportText ?? ""}
              spellCheck={false}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              disabled={exportText === null}
              onClick={() => void copyExport()}
            >
              {exportCopied ? "Copied." : "Copy YAML"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import YAML</DialogTitle>
            <DialogDescription>
              Paste a methodology document — it replaces the canvas
              (Validate, then Save to persist).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Methodology YAML to import"
            className="min-h-[30vh] font-mono text-xs"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            spellCheck={false}
          />
          {importError && (
            <p role="alert" className="text-sm text-destructive">
              {importError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setImportOpen(false)}
            >
              Cancel
            </Button>
            <Button className="min-h-[44px]" onClick={() => void onImportApply()}>
              Apply to canvas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}
