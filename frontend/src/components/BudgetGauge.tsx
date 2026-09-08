"use client";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
    return (
      <div className="flex flex-col gap-2" aria-label="Loading budget">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
      </div>
    );
  }
  const pct = (used: number, max: number) =>
    max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <p>
          Calls {budget.calls_used}/{budget.max_model_calls}
        </p>
        <Progress
          value={pct(budget.calls_used, budget.max_model_calls)}
          className="motion-reduce:transition-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <p>
          Rounds {budget.rounds_used}/{budget.max_research_rounds}
        </p>
        <Progress
          value={pct(budget.rounds_used, budget.max_research_rounds)}
          className="motion-reduce:transition-none"
        />
      </div>
      {budget.exhausted && <p className="font-medium">Budget exhausted.</p>}
    </div>
  );
}
