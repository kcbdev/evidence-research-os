"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listClaims, type ClaimRow } from "@/lib/api";
import ContradictionBadge from "@/components/ContradictionBadge";
import EvidenceTraceModal from "@/components/EvidenceTraceModal";

type SortKey = "confidence" | "status";
type SortDir = 1 | -1;

const STATUSES = [
  "SUPPORTED",
  "STRONGLY_SUPPORTED",
  "WEAKLY_SUPPORTED",
  "DISPUTED",
  "CONTRADICTED",
  "INSUFFICIENT_EVIDENCE",
  "UNVERIFIABLE",
];

export default function ClaimsPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [oppositionOnly, setOppositionOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [sortDir, setSortDir] = useState<SortDir>(-1);
  const [openClaim, setOpenClaim] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await listClaims(id, {
          status: status || undefined,
          min_confidence: minConfidence === "" ? undefined : Number(minConfidence),
          has_opposition: oppositionOnly || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, status, minConfidence, oppositionOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === "confidence" ? -1 : 1);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const cmp =
      sortKey === "confidence"
        ? a.confidence - b.confidence
        : a.status.localeCompare(b.status);
    return cmp * sortDir;
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/lab/${id}`} className="text-sm underline">
          ← Lab overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Claims</h1>
      </div>

      <form onSubmit={(e) => e.preventDefault()} aria-label="Claim filters">
        <FieldGroup>
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-56">
              <FieldLabel htmlFor="claim-status">Status</FieldLabel>
              <Select
                value={status || "any"}
                onValueChange={(v) => setStatus(v === "any" ? "" : (v ?? ""))}
              >
                <SelectTrigger id="claim-status" aria-label="Status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Status</SelectLabel>
                    <SelectItem value="any">any</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor="claim-minconf">Min confidence</FieldLabel>
              <Input
                id="claim-minconf"
                aria-label="Min confidence"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={minConfidence}
                onChange={(e) => setMinConfidence(e.target.value)}
              />
            </Field>
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label="Opposition only"
                checked={oppositionOnly}
                onChange={(e) => setOppositionOnly(e.target.checked)}
              />
              Opposition only
            </label>
          </div>
        </FieldGroup>
      </form>

      {loading && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-10" />
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
      {!loading && !error && sorted.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background">ID</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort("status")}
                >
                  Status {sortKey === "status" ? (sortDir === 1 ? "▲" : "▼") : ""}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort("confidence")}
                >
                  Confidence{" "}
                  {sortKey === "confidence" ? (sortDir === 1 ? "▲" : "▼") : ""}
                </Button>
              </TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Statement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="sticky left-0 bg-background font-mono">
                  <Button
                    variant="link"
                    onClick={() => setOpenClaim(row.id)}
                    aria-label={`Open evidence trace for ${row.id}`}
                  >
                    {row.id}
                  </Button>
                </TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell className="tabular-nums">
                  {row.confidence.toFixed(2)}
                </TableCell>
                <TableCell>
                  <ContradictionBadge opposition={row.opposition} />
                </TableCell>
                <TableCell>{row.statement}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!loading && !error && sorted.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No claims match these filters.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {openClaim && (
        <EvidenceTraceModal
          projectId={id}
          claimId={openClaim}
          onClose={() => setOpenClaim(null)}
        />
      )}
    </div>
  );
}
