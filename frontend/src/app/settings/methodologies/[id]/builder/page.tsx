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
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import NodePalette from "@/components/builder/NodePalette";
import StageCard from "@/components/builder/StageCard";
import {
  getMethodology,
  putMethodology,
  type MethodologyDetail,
} from "@/lib/api";
import {
  bridgeDeletions,
  connectConstrained,
  methodologyToFlow,
  nextStageId,
  orderStages,
  stageLabel,
  NODE_H,
  NODE_W,
  ROW_H,
  type StageNode,
  type StageSpecLike,
} from "@/lib/methodology-graph";

const nodeTypes = { stage: StageCard };

const ALL_MODES = ["research", "brainstorm", "academic"] as const;

const PLACEHOLDERS: Record<string, string> = {
  roles: "Role assignment editing arrives in PBI-069.",
  tools: "Tool enablement editing arrives in PBI-069.",
  budget: "Budget default editing arrives in PBI-069.",
  metadata: "Full metadata editing arrives in PBI-069.",
};

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
  // Live mirror of edges for callbacks that must not close over stale
  // state (onConnect runs outside the render cycle).
  const lastEdgesRef = useRef<Edge[]>([]);
  useEffect(() => {
    lastEdgesRef.current = edges;
  }, [edges]);
  // The Saved indicator is only true for the exact saved state — any
  // edit dirties it again (PBI-070's Validate-gating builds on this).
  useEffect(() => {
    setSaved(false);
  }, [nodes, edges, name, modes]);

  useEffect(() => {
    getMethodology(id)
      .then((m) => {
        setMethodology(m);
        setName(m.name);
        setModes(m.compatible_modes);
        const map: Record<string, StageSpecLike> = {};
        for (const s of (m.workflow?.stages ?? []) as StageSpecLike[]) {
          map[s.id] = s;
        }
        setStageMap(map);
        const flow = methodologyToFlow(m);
        setNodes(flow.nodes);
        setEdges(flow.edges);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load"),
      );
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
        // Drop orphaned stage data with the nodes: PBI-067's inspector
        // must never read a deleted stage back.
        setStageMap((m) => {
          const next = { ...m };
          for (const id of removed) delete next[id];
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
    const stageId = nextStageId(node, new Set(nodes.map((n) => n.id)));
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), -ROW_H);
    setStageMap((m) => ({ ...m, [stageId]: { id: stageId, node } }));
    setNodes((ns) => [
      ...ns,
      {
        id: stageId,
        type: "stage",
        position: { x: 0, y: maxY + ROW_H },
        width: NODE_W,
        height: NODE_H,
        data: { stageId, node, label: stageLabel(node) },
      },
    ]);
    // Appending extends the chain: a single tail connects straight to
    // the new node. Multiple tails (or none) leave the node floating —
    // save validation names it instead of guessing.
    const sources = new Set(edges.map((e) => e.source));
    const tails = nodes.map((n) => n.id).filter((id) => !sources.has(id));
    if (tails.length === 1) {
      const tail = tails[0];
      setEdges((es) => [...es, { id: `e-${tail}-${stageId}`, source: tail, target: stageId }]);
    }
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
      const savedDoc = await putMethodology(id, {
        ...methodology,
        name,
        compatible_modes: modes,
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

  const selected = selectedId !== null ? nodes.find((n) => n.id === selectedId) ?? null : null;

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

      <NodePalette open={paletteOpen} onOpenChange={setPaletteOpen} onPick={addNode} />

      {/* Inspector: PBI-067 owns content + resizable widening
          (deferred here — plain Sheet until the inspector has content
          worth widening for). */}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selected?.data.label ?? "Node"}</SheetTitle>
            <SheetDescription className="font-mono">
              {selected?.data.node}
            </SheetDescription>
          </SheetHeader>
          <p className="px-4 text-sm text-muted-foreground">
            Node inspector content arrives in PBI-067 (roles) and PBI-068
            (conditions).
          </p>
        </SheetContent>
      </Sheet>
    </div>
  );
}
