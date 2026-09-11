"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listRuns, type RunSummary } from "@/lib/api";

export default function RunsPage() {
  const { id } = useParams<{ id: string }>();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setRuns(await listRuns(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href={`/lab/${id}`} className="text-sm underline">
          ← Lab overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Run history</h1>
        <p className="text-sm text-muted-foreground">
          Newest first. History survives backend restarts.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {runs === null && !error && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}
      {runs !== null && runs.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No runs yet</EmptyTitle>
            <EmptyDescription>
              Start one from the Overview tab.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {runs !== null && runs.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Methodology</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.run_id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/lab/${id}/runs/${run.run_id}`}
                      className="underline"
                      aria-label={`Open run ${run.run_id}`}
                    >
                      {run.run_id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {run.status}
                    {run.needs_approval ? " · needs approval" : ""}
                  </TableCell>
                  <TableCell>{run.mode ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs max-w-48 truncate">
                    {run.methodology_id ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {run.started_at ? run.started_at.slice(0, 16).replace("T", " ") : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {run.duration_s == null ? "—" : `${Math.round(run.duration_s)}s`}
                  </TableCell>
                  <TableCell className="tabular-nums">{run.events_count}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {run.error ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
