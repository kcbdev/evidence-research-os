"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getAuditLatest, rerunAudit, type AuditRow } from "@/lib/api";

type StatusFilter = "" | "PASS" | "WARNING" | "FAIL";

const STAGE_VARIANT = {
  PASS: "default",
  WARNING: "outline",
  FAIL: "destructive",
} as const;

function AuditBody() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("");
  const [claim, setClaim] = useState(search.get("claim") ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAuditLatest(id, {
        status: status || undefined,
        claim_id: claim || undefined,
      });
      setRunId(res.audit_run_id);
      setRows(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, status, claim]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRerun(claimId?: string) {
    setRerunning(true);
    setError(null);
    try {
      await rerunAudit(id, claimId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "re-run failed");
    } finally {
      setRerunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/lab/${id}`} className="text-sm underline">
          ← Lab overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Citation audit</h1>
        {runId && (
          <p className="mt-1 text-xs text-muted-foreground">
            Latest run: <span className="font-mono">{runId}</span>
          </p>
        )}
      </div>

      <form onSubmit={(e) => e.preventDefault()} aria-label="Audit filters">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            Status
            <select
              aria-label="Status filter"
              className="rounded border bg-background px-2 py-1"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="">any</option>
              <option value="FAIL">FAIL only</option>
              <option value="WARNING">WARNING only</option>
              <option value="PASS">PASS only</option>
            </select>
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            Claim
            <input
              aria-label="Claim filter"
              className="w-32 rounded border bg-background px-2 py-1 font-mono"
              placeholder="C-001"
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
            />
          </label>
          <Button
            className="min-h-[44px]"
            disabled={rerunning}
            onClick={() => handleRerun(claim || undefined)}
          >
            {rerunning ? "Re-running…" : claim ? "Re-run this claim" : "Re-run audit"}
          </Button>
        </div>
      </form>

      {loading && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loading && !error && rows.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No audit results</EmptyTitle>
            <EmptyDescription>
              {runId
                ? "No rows match the current filters."
                : "No audit has run yet — re-run to verify citations."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!loading && !error && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Claim</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const key = `${row.claim_id}|${row.evidence_id}|${row.stage}`;
              const open = expanded === key;
              return (
                <TableRow key={`${key}|${i}`}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/lab/${id}/claims?claim=${row.claim_id}`}
                      className="underline"
                      aria-label={`Open trace for ${row.claim_id}`}
                    >
                      {row.claim_id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono">
                    {row.evidence_id ?? "—"}
                  </TableCell>
                  <TableCell>{row.stage}</TableCell>
                  <TableCell>
                    <Badge variant={STAGE_VARIANT[row.status]}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="link"
                      size="sm"
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} reasoning for ${row.claim_id} ${row.stage}`}
                      onClick={() => setExpanded(open ? null : key)}
                    >
                      {open ? "hide" : "reasoning"}
                    </Button>
                    {open && (
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {row.detail || "(no detail recorded)"}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditBody />
    </Suspense>
  );
}
