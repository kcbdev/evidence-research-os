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
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ModelSelector from "@/components/ModelSelector";
import CustomCodeCard from "@/components/builder/CustomCodeCard";
import NodePalette from "@/components/builder/NodePalette";
import RoleCard from "@/components/builder/RoleCard";
import RoleEditorDialog from "@/components/builder/RoleEditorDialog";
import StageCard from "@/components/builder/StageCard";
import {
  getMethodology,
  listCustomNodes,
  listPrompts,
  listRoles,
  listSkills,
  listTools,
  putMethodology,
  type CustomNodeInfo,
  type LibraryRoleEntry,
  type MethodologyDetail,
  type PromptEntry,
  type SkillEntry,
  type ToolRow,
} from "@/lib/api";
import {
  bridgeDeletions,
  connectConstrained,
  embedDiffers,
  methodologyToFlow,
  nextStageId,
  orderStages,
  stageLabel,
  NODE_H,
  NODE_W,
  ROW_H,
  type BuilderNodeKind,
  type StageNode,
  type StageSpecLike,
} from "@/lib/methodology-graph";

const nodeTypes = { stage: StageCard, role: RoleCard, code: CustomCodeCard };

const ALL_MODES = ["research", "brainstorm", "academic"] as const;

const PLACEHOLDERS: Record<string, string> = {
  roles: "Role assignment editing arrives in PBI-069.",
  tools: "Tool enablement editing arrives in PBI-069.",
  budget: "Budget default editing arrives in PBI-069.",
  metadata: "Full metadata editing arrives in PBI-069.",
};

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

export default function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [methodology, setMethodology] = useState<MethodologyDetail | null>(null);
  const [nodes, setNodes] = useState<StageNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [stageMap, setStageMap] = useState<Record<string, StageSpecLike>>({});
  const [name, setName] = useState("");
  const [modes, setModes] = useState<string[]>([]);
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

  useEffect(() => {
    async function load() {
      try {
        const [m, roles, codes, pr, sk, to] = await Promise.all([
          getMethodology(id),
          listRoles(),
          listCustomNodes(),
          listPrompts(),
          listSkills(),
          listTools(),
        ]);
        setMethodology(m);
        setName(m.name);
        setModes(m.compatible_modes);
        setLibraryRoles(roles);
        setRolePrompts(pr);
        setRoleSkills(sk);
        setToolRows(to);
        setCustomNodes(codes);
        const map: Record<string, StageSpecLike> = {};
        for (const s of (m.workflow?.stages ?? []) as StageSpecLike[]) {
          map[s.id] = s;
        }
        setStageMap(map);
        const flow = methodologyToFlow(
          m,
          roles.map((r) => ({ id: r.id, name: r.name, model: r.model, tools: r.tools })),
          codes
            .filter((c) => c.node_id !== null && c.load_error === null)
            .map((c) => ({
              node_id: c.node_id as string,
              filename: c.filename,
              description: c.description,
            })),
        );
        setNodes(flow.nodes);
        setEdges(flow.edges);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "failed to load");
      }
    }
    void load();
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
  // The Saved indicator is only true for the exact saved state.
  // nodes/edges/name/modes cover structural edits; embed and flag
  // mutations clear it explicitly at their call sites (a deps entry on
  // methodology/stageMap would clobber the post-save Saved=true, since
  // save itself resyncs both). PBI-070's Validate-gating builds on this.
  useEffect(() => {
    setSaved(false);
  }, [nodes, edges, name, modes]);

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
          return next;
        });
        const gone = new Set(removed);
        setSelectedId((sel) => (sel !== null && gone.has(sel) ? null : sel));
      }
    },
    [edges],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);

  // Sequential-only canvas: one chain. A new connection replaces any
  // existing edge out of the source or into the target, and says so —
  // edges must never vanish magically (loops arrive in PBI-068).
  const onConnect = useCallback((conn: Connection) => {
    const { edges: next, replaced } = connectConstrained(
      // read current edges via setState updater to avoid stale closures
      lastEdgesRef.current,
      { source: conn.source, target: conn.target },
    );
    setEdges(next);
    setNotice(
      replaced
        ? "Replaced the existing link — this canvas is sequential-only; loop-backs arrive in PBI-068."
        : null,
    );
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
    // save validation names it instead of guessing.
    const sources = new Set(edges.map((e) => e.source));
    const tails = nodes.map((n) => n.id).filter((nid) => !sources.has(nid));
    if (tails.length === 1) {
      const tail = tails[0];
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

  async function onSave() {
    if (methodology === null) return;
    const ordered = orderStages(nodes, edges, stageMap);
    if ("error" in ordered) {
      setSaved(false);
      setError(ordered.error);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // Prune orphan embeds (deleted/retargeted role nodes): the PUT
      // carries only what the saved stages reference — stale snapshots
      // never accumulate.
      const usedRoles = new Set(ordered.stages.map((s) => s.node));
      const savedDoc = await putMethodology(id, {
        ...methodology,
        name,
        compatible_modes: modes,
        custom_roles: (methodology.custom_roles ?? []).filter((r) => usedRoles.has(r.id)),
        workflow: { stages: ordered.stages },
      });
      setMethodology(savedDoc);
      // Resync stage data from the server-normalized document — the
      // local map still holds minimal pre-save shapes for added nodes.
      const map: Record<string, StageSpecLike> = {};
      for (const s of (savedDoc.workflow?.stages ?? []) as StageSpecLike[]) {
        map[s.id] = s;
      }
      setStageMap(map);
      setSaved(true);
    } catch (err) {
      setSaved(false);
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  const selected =
    selectedId !== null ? (nodes.find((n) => n.id === selectedId) ?? null) : null;
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
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
          <Button className="min-h-[44px]" disabled={saving || methodology === null} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save"}
          </Button>
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
                Sequential chain only — drag between handles to reconnect
                (replaces the existing link). Loop-backs arrive in PBI-068.
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
                <p className="text-sm text-muted-foreground">{PLACEHOLDERS[t]}</p>
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
                    if (!v && selectedLibrary !== null) {
                      // OFF reverts to the library snapshot (F1: hiding
                      // the input must never keep stale values).
                      setModelValue(selectedLibrary.model);
                      applyRoleOverride({ model: selectedLibrary.model });
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
                      Empty means inherit from Settings → Models.
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
