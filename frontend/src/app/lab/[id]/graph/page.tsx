"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getGraph, type GraphData } from "@/lib/api";

const COL_W = 260;
const ROW_H = 64;
const PAD = 24;

const EDGE_CLASS: Record<string, string> = {
  supports: "stroke-primary",
  contradicts: "stroke-destructive",
  references: "stroke-muted-foreground",
};

type GNode = GraphData["nodes"][number];

function layout(nodes: GNode[]) {
  // Three lanes by type (claims | evidence | sources), stacked in id
  // order. Deliberately static — this view explores structure, never
  // edits it, so no force simulation or drag-to-move exists.
  const lanes: Record<string, GNode[]> = { claim: [], evidence: [], source: [] };
  for (const n of nodes) lanes[n.type]?.push(n);
  const pos = new Map<string, { x: number; y: number }>();
  (["claim", "evidence", "source"] as const).forEach((lane, li) => {
    lanes[lane].forEach((n, i) => {
      pos.set(n.id, { x: PAD + li * COL_W, y: PAD + i * ROW_H });
    });
  });
  const height = Math.max(...Object.values(lanes).map((l) => l.length), 1) * ROW_H + PAD * 2;
  return { pos, width: COL_W * 3 + PAD * 2, height };
}

function label(n: GNode) {
  if (n.type === "claim") return n.statement ?? n.id;
  if (n.type === "source") return n.title ?? n.id;
  return n.excerpt ?? n.id;
}

export default function GraphPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<GNode | null>(null);
  const [zoom, setZoom] = useState(1);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getGraph(id, statusFilter || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Couldn’t load the graph</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];
  const { pos, width, height } = layout(nodes);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href={`/lab/${id}`} className="text-sm underline">
          ← Lab overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Evidence graph</h1>
        <p className="text-sm text-muted-foreground">
          Read-only — click a node for detail. {nodes.length} nodes, {edges.length} edges.
        </p>
      </div>

      <form onSubmit={(e) => e.preventDefault()} aria-label="Graph filters">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            Claim status
            <input
              aria-label="Status filter"
              className="w-40 rounded border bg-background px-2 py-1"
              placeholder="DISPUTED,SUPPORTED"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-2" role="group" aria-label="Zoom">
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
              +
            </Button>
            <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
              −
            </Button>
          </div>
          <span className="flex items-center gap-2" aria-label="Legend">
            <Badge variant="default">supports</Badge>
            <Badge variant="destructive">contradicts</Badge>
            <Badge variant="outline">references</Badge>
          </span>
        </div>
      </form>

      {nodes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No graph yet</EmptyTitle>
            <EmptyDescription>
              {statusFilter
                ? "No claims match the current filter."
                : "Run research to produce claims, evidence, and sources."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex-1 overflow-auto rounded-lg border" aria-label="Graph canvas">
            <svg
              width={width * zoom}
              height={height * zoom}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`Evidence graph: ${nodes.length} nodes`}
            >
              {edges.map((e, i) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                return (
                  <line
                    key={`${e.from}|${e.to}|${i}`}
                    x1={a.x + 220}
                    y1={a.y + 20}
                    x2={b.x}
                    y2={b.y + 20}
                    className={EDGE_CLASS[e.relation] ?? "stroke-muted-foreground"}
                    strokeWidth={1.5}
                  />
                );
              })}
              {nodes.map((n) => {
                const p = pos.get(n.id);
                if (!p) return null;
                const active = selected?.id === n.id;
                return (
                  <g
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.type} ${n.id}`}
                    className="cursor-pointer"
                    onClick={() => setSelected(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(n);
                      }
                    }}
                  >
                    <rect
                      x={p.x}
                      y={p.y}
                      width={220}
                      height={40}
                      rx={n.type === "claim" ? 8 : n.type === "source" ? 2 : 20}
                      className={
                        active
                          ? "fill-primary/20 stroke-primary"
                          : "fill-card stroke-border"
                      }
                      strokeWidth={active ? 2 : 1}
                    />
                    <text x={p.x + 8} y={p.y + 17} fontSize={11} fontWeight="bold" className="fill-foreground">
                      {n.id}
                    </text>
                    <text x={p.x + 8} y={p.y + 32} fontSize={10} className="fill-muted-foreground">
                      {(label(n) ?? "").slice(0, 34)}
                      {(label(n) ?? "").length > 34 ? "…" : ""}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <Card className="lg:w-80" aria-label="Node detail">
            <CardHeader>
              <CardTitle className="text-sm">
                {selected ? `${selected.type} ${selected.id}` : "Node detail"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {!selected ? (
                <p className="text-muted-foreground">
                  Click a node to inspect it.
                </p>
              ) : (
                <div className="space-y-2">
                  {selected.status && (
                    <div>
                      <Badge variant="secondary">{selected.status}</Badge>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{label(selected)}</p>
                  {selected.url && (
                    <p>
                      <a href={selected.url} target="_blank" rel="noreferrer" className="underline break-all">
                        {selected.url}
                      </a>
                    </p>
                  )}
                  {selected.strength && (
                    <p className="text-muted-foreground">strength: {selected.strength}</p>
                  )}
                  {selected.type === "claim" && (
                    <p>
                      <Link href={`/lab/${id}/claims`} className="underline">
                        Open in claims table →
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
