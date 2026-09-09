"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { getClaimDetail, listTasks, type ClaimDetail, type DelegatedTask } from "@/lib/api";
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

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setTasks(null);
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
