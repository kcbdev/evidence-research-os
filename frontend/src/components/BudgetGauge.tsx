"use client";

import type { Budget } from "@/lib/api";

/**
 * Project budget limits with run progress. Honest limitation: the SSE
 * event stream carries node names only (no per-call ticks), so live
 * spent-tracking is event-count progress against static limits — true
 * per-call ticks await event enrichment on the backend (open backlog).
 */
export default function BudgetGauge({ budget }: { budget: Budget | null }) {
  if (budget === null) {
    return <p className="text-sm text-zinc-500">Loading budget…</p>;
  }
  const callsPct = Math.min(
    100,
    Math.round((budget.calls_used / budget.max_model_calls) * 100),
  );
  const roundsPct = Math.min(
    100,
    Math.round((budget.rounds_used / budget.max_research_rounds) * 100),
  );
  return (
    <div className="space-y-2 text-sm">
      <div>
        <p>
          Calls {budget.calls_used}/{budget.max_model_calls}
        </p>
        <div className="h-2 rounded bg-zinc-200">
          <div className="h-2 rounded bg-zinc-800" style={{ width: `${callsPct}%` }} />
        </div>
      </div>
      <div>
        <p>
          Rounds {budget.rounds_used}/{budget.max_research_rounds}
        </p>
        <div className="h-2 rounded bg-zinc-200">
          <div
            className="h-2 rounded bg-zinc-800"
            style={{ width: `${roundsPct}%` }}
          />
        </div>
      </div>
      {budget.exhausted && (
        <p className="font-medium text-amber-700">Budget exhausted.</p>
      )}
    </div>
  );
}
