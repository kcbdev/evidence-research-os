"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getBudget,
  getRun,
  retryRun,
  streamRun,
  type Budget,
  type RunEvent,
} from "@/lib/api";
import ApprovalModal from "@/components/ApprovalModal";
import BudgetGauge from "@/components/BudgetGauge";
import RunActivityFeed from "@/components/RunActivityFeed";

interface FeedEvent {
  node: string;
}

function isNodeEvent(data: unknown): data is FeedEvent {
  return (
    typeof data === "object" &&
    data !== null &&
    !("etype" in data) &&
    typeof (data as { node?: unknown }).node === "string"
  );
}

export default function RunView() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [connectKey, setConnectKey] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const streamsRef = useRef<(() => void)[]>([]);
  // Set once this mount resolves a checkpoint: later replays of the same
  // historic checkpoint event must not reopen the modal (single pause
  // per run — there is never a second checkpoint to wait for).
  const resolvedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getBudget(id).then(
      (b) => {
        if (!cancelled) setBudget(b);
      },
      () => {},
    );
    void getRun(id, runId).then(
      (s) => {
        if (cancelled) return;
        if (s.status === "done") {
          // Resting run: render from the status payload, no subscription.
          setEvents(s.events.filter(isNodeEvent));
          setCompleted(true);
          return;
        }
        if (s.status === "failed" || s.status === "interrupted") {
          // Resting but recoverable: show the error + retry, no stream
          // (the stream would terminate immediately on a resting status).
          setEvents(s.events.filter(isNodeEvent));
          setFailed(s.status === "failed"
            ? (s.error ?? "Run failed.")
            : "Run was interrupted by a backend restart. Checkpoints persist — retry resumes explicitly.");
          return;
        }
        if (s.status === "awaiting_approval") {
          setNeedsApproval(true);
        }
        const stop = streamRun(
          id,
          runId,
          (event: RunEvent) => {
            if (cancelled) return;
            if (event.type === "human_checkpoint") {
              if (!resolvedRef.current) setNeedsApproval(true);
            } else if (event.type === "run_done") {
              setCompleted(true);
              setNeedsApproval(false);
            } else {
              const data: unknown = event.data;
              if (isNodeEvent(data)) {
                setEvents((prev) => [...prev, { node: data.node }]);
              }
            }
          },
          () => {
            // Reset-on-open: replay refills from scratch, never duplicates.
            if (!cancelled) {
              setEvents([]);
              if (!resolvedRef.current) setNeedsApproval(false);
            }
          },
        );
        streamsRef.current.push(stop);
      },
      () => {
        if (!cancelled) setEndNote("Run not found or unreachable.");
      },
    );
    return () => {
      cancelled = true;
      const stops = streamsRef.current;
      streamsRef.current = [];
      for (const stop of stops) stop();
    };
  }, [id, runId, connectKey]);

  const onResolved = useCallback((decision: "approve" | "reject") => {
    if (decision === "approve") {
      resolvedRef.current = true;
      setNeedsApproval(false);
      setConnectKey((k) => k + 1); // resubscribe: follow to completion
    } else {
      setNeedsApproval(false);
      setEndNote("Run rejected by reviewer.");
    }
  }, []);

  async function checkStatus() {
    try {
      const s = await getRun(id, runId); // user-initiated, not polling
      setEndNote(`Status: ${s.status}${s.error ? ` — ${s.error}` : ""}`);
    } catch (err) {
      setEndNote(err instanceof Error ? err.message : "status check failed");
    }
  }

  async function onRetry() {
    setRetrying(true);
    setEndNote(null);
    try {
      await retryRun(id, runId);
      resolvedRef.current = false;
      setFailed(null);
      setEvents([]);
      setConnectKey((k) => k + 1); // resubscribe: follow the resumed run
    } catch (err) {
      setEndNote(err instanceof Error ? err.message : "retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main className="flex flex-col gap-6" aria-label="Run view">
      <div>
        <Link href={`/lab/${id}`} className="text-sm underline">
          ← Lab overview
        </Link>
        <h1 className="mt-2 font-mono text-lg">Run {runId}</h1>
      </div>
      {completed && (
        <Alert>
          <AlertTitle>Run completed.</AlertTitle>
        </Alert>
      )}
      {failed && (
        <Alert variant="destructive">
          <AlertTitle>{failed}</AlertTitle>
          <div className="mt-2">
            <Button
              className="min-h-[44px]"
              disabled={retrying}
              onClick={() => void onRetry()}
            >
              {retrying ? "Retrying…" : "Retry from last checkpoint"}
            </Button>
          </div>
        </Alert>
      )}
      {endNote && (
        <p role="status" className="text-sm text-muted-foreground">
          {endNote}
        </p>
      )}
      {!completed && (
        <div>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => void checkStatus()}
          >
            Check status
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetGauge budget={budget} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <RunActivityFeed events={events} />
        </CardContent>
      </Card>

      {needsApproval && !completed && (
        <ApprovalModal
          projectId={id}
          runId={runId}
          onResolved={onResolved}
        />
      )}
    </main>
  );
}
