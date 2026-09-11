"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { listMethodologies, setDefaultMethodology, type MethodologySummary } from "@/lib/api";

export default function MethodologiesPage() {
  const [items, setItems] = useState<MethodologySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setItems(await listMethodologies());
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSetDefault(id: string) {
    setWorking(true);
    setError(null);
    try {
      await setDefaultMethodology(id);
      setConfirmId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "set-default failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm underline">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Methodologies</h1>
          <p className="text-sm text-muted-foreground">
            Saved pipelines. Runs use the mode default unless told otherwise.
          </p>
        </div>
        <Link
          href="/settings/methodologies/new"
          className="min-h-[44px] inline-flex items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          New Methodology
        </Link>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {items === null && !error && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {items !== null && items.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No methodologies</EmptyTitle>
            <EmptyDescription>Create one to start.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {items !== null && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  <Link href={`/settings/methodologies/${m.id}`} className="underline">
                    {m.name}
                  </Link>
                  {m.is_default && <Badge variant="default">default</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{m.description}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {m.id} · modes: {m.compatible_modes.join(", ")}
                </p>
                {confirmId === m.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      Future runs without an explicit methodology will use this. Continue?
                    </span>
                    <Button className="min-h-[44px]" disabled={working} onClick={() => void onSetDefault(m.id)}>
                      {working ? "Setting…" : "Confirm default"}
                    </Button>
                    <Button variant="outline" className="min-h-[44px]" disabled={working} onClick={() => setConfirmId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  !m.is_default && (
                    <div>
                      <Button variant="outline" className="min-h-[44px]" onClick={() => setConfirmId(m.id)}>
                        Set as default
                      </Button>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
