"use client";

import type { Budget } from "@/lib/api";

/**
 * Project budget limits snapshot (fetched once on mount). Honest
 * limitation: the SSE event stream carries node names only (no per-call
 * ticks), so this gauge does NOT live-update during a run and shows no
 * event-count pseudo-progress — true per-call ticks await event
 * enrichment on the backend (open backlog).
 */
export default function BudgetGauge({ budget }: { budget: Budget | null }) {
  if (budget === null) {
    return <p className="text-sm text-zinc-500">Loading budget…</p>;
  }
  const pct = (used: number, max: number) =>
    max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const callsPct = pct(budget.calls_used, budget.max_model_calls);
  const roundsPct = pct(budget.rounds_used, budget.max_research_rounds);
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
