"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
import { listLabProjects, type LabProjectSummary } from "@/lib/api";

export default function Dashboard() {
  const [projects, setProjects] = useState<LabProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listLabProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="flex flex-col gap-6" aria-label="Dashboard">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Evidence Research OS</h1>
          <p className="text-sm text-muted-foreground">
            Lab Projects — one workspace per research question.
          </p>
        </div>
        {/* PBI-050: creation lives at /lab/new (mode, models,
            create-and-start); the dashboard only links there. */}
        <Link href="/lab/new" className="min-h-[44px] inline-flex items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          New Lab Project
        </Link>
      </div>

      {loading && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loading && !error && projects.filter((p) => !p.archived).length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No Lab Projects yet</EmptyTitle>
            <EmptyDescription>
              Create one above to start researching.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!loading && !error && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects
            .filter((p) => !p.archived)
            .map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  <Link href={`/lab/${p.id}`} className="underline">
                    {p.title}
                  </Link>
                </CardTitle>
                <CardDescription>{p.question}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Badge variant="secondary">{p.mode}</Badge>
                <span className="text-sm text-muted-foreground">
                  {p.claims_count} claims
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
