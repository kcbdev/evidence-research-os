"use client";

import { useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getCheckpoint } from "@/lib/api";

export interface FeedEntry {
  node: string;
  occurrence: number;
}

export function occurrencesFor(events: { node: string }[]): FeedEntry[] {
  // The feed carries real node executions in order (synthetic typed
  // events never reach it — the run view filters them). The Nth
  // appearance of a node is its Nth execution: loop re-runs included.
  const counts = new Map<string, number>();
  return events.map((e) => {
    const occurrence = (counts.get(e.node) ?? 0) + 1;
    counts.set(e.node, occurrence);
    return { node: e.node, occurrence };
  });
}

export default function RunActivityFeed({
  events,
  projectId,
  runId,
}: {
  events: { node: string }[];
  projectId: string;
  runId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FeedEntry | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (events.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Waiting for activity…</EmptyTitle>
          <EmptyDescription>
            Node transitions appear here as the run executes.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const entries = occurrencesFor(events);

  function openSnapshot(entry: FeedEntry) {
    setSelected(entry);
    setSnapshot(null);
    setError(null);
    setLoading(true);
    setOpen(true);
    getCheckpoint(projectId, runId, entry.node, entry.occurrence).then(
      (body) => {
        setSnapshot(JSON.stringify(body.state, null, 2));
        setLoading(false);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : "failed to load");
        setLoading(false);
      },
    );
  }

  return (
    <>
      <ol className="flex flex-col gap-1 text-sm">
        {entries.map((e, i) => (
          <li key={`${e.node}-${e.occurrence}-${i}`} className="flex gap-2">
            <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              className="font-mono underline decoration-dotted underline-offset-2 hover:text-foreground"
              aria-label={`Inspect state after ${e.node} (run ${e.occurrence})`}
              onClick={() => openSnapshot(e)}
            >
              {e.node}
              {e.occurrence > 1 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ×{e.occurrence}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selected
                ? `State after ${selected.node} (run ${selected.occurrence})`
                : "Node state"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {loading && <p className="text-sm text-muted-foreground">Loading snapshot…</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {snapshot !== null && (
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                {snapshot}
              </pre>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
