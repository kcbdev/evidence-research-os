"use client";

import { useState } from "react";
import { approveRun } from "@/lib/api";

export default function ApprovalModal({
  projectId,
  runId,
  onResolved,
}: {
  projectId: string;
  runId: string;
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await approveRun(projectId, runId, decision, note);
      onResolved(); // parent resubscribes: the stream ended at the pause
    } catch (err) {
      setError(err instanceof Error ? err.message : "approval failed");
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Human checkpoint approval"
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-8"
    >
      <div className="w-full max-w-md rounded bg-white p-6">
        <h2 className="text-lg font-semibold">Human checkpoint</h2>
        <p className="mt-1 text-sm text-zinc-600">
          The run paused for approval. Approve to resume, or reject to stop
          it. Either way your decision is recorded.
        </p>
        <input
          aria-label="Approval note"
          className="mt-3 w-full rounded border px-2 py-1"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="mt-2 text-red-600">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button
            disabled={busy}
            onClick={() => void decide("approve")}
            className="rounded bg-zinc-900 px-4 py-1 text-white disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => void decide("reject")}
            className="rounded border px-4 py-1 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
