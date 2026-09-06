"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getBudget,
  getRun,
  streamRun,
  type Budget,
  type RunEvent,
} from "@/lib/api";
import ApprovalModal from "@/components/ApprovalModal";
import BudgetGauge from "@/components/BudgetGauge";
import RunActivityFeed from "@/components/RunActivityFeed";

export default function RunView() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const [events, setEvents] = useState<{ node: string }[]>([]);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [connectKey, setConnectKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getBudget(id).then(
      (b) => {
        if (!cancelled) setBudget(b);
      },
      () => {},
    );
    const stop = streamRun(
      id,
      runId,
      (event: RunEvent) => {
        if (cancelled) return;
        if (event.type === "human_checkpoint") {
          setNeedsApproval(true);
        } else if (event.type === "run_done") {
          setCompleted(true);
        } else {
          const data = event.data as { node?: string };
          const node = data.node;
          if (typeof node === "string") {
            setEvents((prev) => [...prev, { node }]);
          }
        }
      },
      () => {
        // Reset-on-open: replay refills from scratch, never duplicates.
        if (!cancelled) {
          setEvents([]);
          setNeedsApproval(false);
        }
      },
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, [id, runId, connectKey]);

  const onResolved = useCallback(() => {
    setNeedsApproval(false);
    setConnectKey((k) => k + 1); // resubscribe: follow to completion
  }, []);

  async function checkStatus() {
    try {
      const s = await getRun(id, runId); // user-initiated, not polling
      setEndNote(`Status: ${s.status}${s.error ? ` — ${s.error}` : ""}`);
    } catch (err) {
      setEndNote(err instanceof Error ? err.message : "status check failed");
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/lab/${id}`} className="text-sm underline">
        ← Lab overview
      </Link>
      <h1 className="mt-2 font-mono text-lg">Run {runId}</h1>
      {completed && (
        <p className="mt-2 rounded border p-2 text-sm">Run completed.</p>
      )}
      {endNote && <p className="mt-2 text-sm">{endNote}</p>}
      {!completed && (
        <button className="mt-2 text-sm underline" onClick={() => void checkStatus()}>
          Check status
        </button>
      )}

      <section aria-label="Budget" className="mt-4 rounded border p-3">
        <h2 className="font-medium">Budget</h2>
        <BudgetGauge budget={budget} />
      </section>

      <section aria-label="Activity" className="mt-4 rounded border p-3">
        <h2 className="font-medium">Activity</h2>
        <div className="mt-2">
          <RunActivityFeed events={events} />
        </div>
      </section>

      {needsApproval && (
        <ApprovalModal
          projectId={id}
          runId={runId}
          onResolved={onResolved}
        />
      )}
    </main>
  );
}
