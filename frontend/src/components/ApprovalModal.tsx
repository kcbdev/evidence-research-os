"use client";

import { useEffect, useState } from "react";
import { approveRun, listClaims } from "@/lib/api";

export default function ApprovalModal({
  projectId,
  runId,
  onResolved,
}: {
  projectId: string;
  runId: string;
  onResolved: (decision: "approve" | "reject") => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<{ status: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listClaims(projectId).then(
      (rows) => {
        if (!cancelled) setDossier(rows);
      },
      () => {
        if (!cancelled) setDossier([]); // dossier is advisory, never blocking
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function decide(decision: "approve" | "reject") {
    if (busy) return; // re-entrancy: two clicks in one tick, one POST
    setBusy(true);
    setError(null);
    try {
      await approveRun(projectId, runId, decision, note);
      onResolved(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "approval failed");
      setBusy(false);
    }
  }

  const counts =
    dossier === null
      ? null
      : dossier.reduce<Record<string, number>>((acc, row) => {
          acc[row.status] = (acc[row.status] ?? 0) + 1;
          return acc;
        }, {});

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Human checkpoint approval"
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-8"
    >
      <div className="w-full max-w-md rounded bg-white p-6 dark:bg-zinc-900 dark:text-zinc-100">
        <h2 className="text-lg font-semibold">Human checkpoint</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          <strong>Approve</strong> publishes <code>report.md</code> built
          from exactly the adjudicated claims below.{" "}
          <strong>Reject</strong> stops the run — nothing is published.
        </p>
        {counts === null ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Loading claims…
          </p>
        ) : (
          <dl className="mt-2 text-sm">
            <div className="flex justify-between">
              <dt>Total claims</dt>
              <dd className="tabular-nums">{dossier?.length ?? 0}</dd>
            </div>
            {Object.entries(counts).map(([status, n]) => (
              <div key={status} className="flex justify-between">
                <dt>{status}</dt>
                <dd className="tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
        )}
        <a
          href={`/lab/${projectId}/claims`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm underline"
        >
          Inspect the claims table →
        </a>
        <input
          aria-label="Approval note"
          className="mt-3 w-full rounded border px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && (
          <p className="mt-2 text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            disabled={busy}
            onClick={() => void decide("approve")}
            className="rounded bg-zinc-900 px-4 py-1 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => void decide("reject")}
            className="rounded border px-4 py-1 disabled:opacity-50 dark:border-zinc-600"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
