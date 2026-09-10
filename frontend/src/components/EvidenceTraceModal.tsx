"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuditLatest, getClaimDetail, listTasks, type AuditRow, type ClaimDetail, type DelegatedTask } from "@/lib/api";
import ClaimConfidenceBar from "./ClaimConfidenceBar";

export default function EvidenceTraceModal({
  projectId,
  claimId,
  onClose,
}: {
  projectId: string;
  claimId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<DelegatedTask[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setTasks(null);
    setAudit(null);
    getClaimDetail(projectId, claimId).then(
      (d) => {
        if (!cancelled) setDetail(d);
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      },
    );
    listTasks(projectId, claimId).then(
      (t) => {
        if (!cancelled) setTasks(t);
      },
      () => {
        if (!cancelled) setTasks([]); // tasks advisory; trace stands alone
      },
    );
    // Audit badges advisory too: no audit run yet → no badges, no error.
    getAuditLatest(projectId, { claim_id: claimId }).then(
      (a) => {
        if (!cancelled) setAudit(a.results);
      },
      () => {
        if (!cancelled) setAudit([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, claimId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{claimId}</DialogTitle>
          <DialogDescription>
            Claim → evidence → source trace. One click per row.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !detail && (
          <div className="flex flex-col gap-2" aria-label="Loading">
            <Skeleton className="h-6" />
            <Skeleton className="h-24" />
          </div>
        )}
        {detail && (
          <div className="flex flex-col gap-4">
            <p>{detail.claim.statement}</p>
            <p className="text-sm text-muted-foreground">
              Status: {detail.claim.status} · Adjudicated by:{" "}
              {detail.claim.adjudicated_by ?? "pending"}
            </p>
            <ClaimConfidenceBar confidence={detail.claim.confidence} />
            <section>
              <h3 className="font-medium">
                Evidence ({detail.evidence.length})
              </h3>
              {detail.evidence.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No backing evidence — an unsupported claim is never
                  SUPPORTED, no matter who agrees.
                </p>
              )}
              <ul className="mt-1 flex flex-col gap-2">
                {detail.evidence.map((ev) => {
                  const src = detail.sources.find(
                    (s) => s.id === ev.source_id,
                  );
                  const checks = (audit ?? []).filter(
                    (r) => r.evidence_id === ev.id,
                  );
                  const worst = checks.some((r) => r.status === "FAIL")
                    ? "FAIL"
                    : checks.some((r) => r.status === "WARNING")
                      ? "WARNING"
                      : checks.length > 0
                        ? "PASS"
                        : null;
                  return (
                    <li
                      key={ev.id}
                      className="rounded-md border p-2 text-sm"
                    >
                      <p className="font-medium">
                        {ev.id}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {ev.evidence_type}/{ev.strength}
                        </span>
                        {worst && (
                          <Link
                            href={`/lab/${projectId}/audit?claim=${claimId}`}
                            className="ml-2"
                            aria-label={`Audit result ${worst} for ${ev.id} — open audit`}
                          >
                            <Badge
                              variant={
                                worst === "FAIL"
                                  ? "destructive"
                                  : worst === "WARNING"
                                    ? "outline"
                                    : "default"
                              }
                            >
                              audit: {worst}
                            </Badge>
                          </Link>
                        )}
                      </p>
                      <blockquote className="mt-1 border-l-2 border-zinc-300 pl-2 dark:border-zinc-600">
                        {ev.text_reference}
                      </blockquote>
                      <p className="mt-1 text-muted-foreground">
                        {ev.location.section ?? ""}{" "}
                        {ev.location.page !== undefined &&
                          `(p. ${ev.location.page})`}
                        {src ? (
                          <>
                            {" — "}
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {src.title}
                            </a>{" "}
                            (tier {src.quality_tier})
                          </>
                        ) : (
                          <> — source {ev.source_id} missing</>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section>
              <h3 className="font-medium">
                Linked tasks ({tasks === null ? "…" : tasks.length})
              </h3>
              {tasks !== null && tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No targeted research tasked for this claim.
                </p>
              )}
              <ul className="mt-1 flex flex-col gap-2">
                {(tasks ?? []).map((task) => (
                  <li
                    key={task.id}
                    id={`task-${task.id}`}
                    className="rounded-md border p-2 text-sm"
                  >
                    <p className="font-medium">
                      {task.id}
                      <span className="ml-2 font-normal text-muted-foreground">
                        → {task.assigned_agent}
                      </span>
                    </p>
                    <p className="mt-1">{task.question}</p>
                    <p className="mt-1 text-muted-foreground">{task.reason}</p>
                    {task.required_sources.length > 0 && (
                      <p className="mt-1 text-muted-foreground">
                        Needs: {task.required_sources.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
