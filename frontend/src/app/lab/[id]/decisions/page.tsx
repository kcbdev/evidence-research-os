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
import { listDecisions, type DecisionEntry } from "@/lib/api";

export default function DecisionsPage() {
  const { id } = useParams<{ id: string }>();
  const [decisions, setDecisions] = useState<DecisionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setDecisions(await listDecisions(id));
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
        <h1 className="mt-2 text-2xl font-semibold">Decisions</h1>
        <p className="text-sm text-muted-foreground">
          Episodic log — what happened and why. Read-only audit trail.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {decisions === null && !error && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}
      {decisions !== null && decisions.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No decisions yet</EmptyTitle>
            <EmptyDescription>
              Approvals, repairs, and run endings land here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {decisions !== null && decisions.length > 0 && (
        <ol className="flex flex-col gap-3">
          {decisions.map((d) => (
            <li key={d.id} className="rounded-lg border p-3">
              <p className="font-medium">{d.what}</p>
              {d.why && (
                <p className="mt-1 text-sm text-muted-foreground">{d.why}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono">{d.id}</span> · {d.timestamp}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
