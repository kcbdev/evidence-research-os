"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listTools, type ToolRow } from "@/lib/api";

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTools()
      .then(setTools)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "failed to load"),
      );
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href="/settings/methodologies" className="text-sm underline">
          ← Methodologies
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Tools</h1>
        <p className="text-sm text-muted-foreground">
          Read-only registry of the tools roles may use. New tools are a
          backend concern (code, not configuration) — they appear here
          once the backend ships them.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {tools === null && !error && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {tools !== null && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className="font-mono font-medium">{t.name}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell className="font-mono text-xs">{t.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
