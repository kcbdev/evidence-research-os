"use client";

import { Progress } from "@/components/ui/progress";
import type { Confidence } from "@/lib/api";

const DIMS: { key: keyof Confidence; label: string }[] = [
  { key: "source_quality", label: "Source quality" },
  { key: "methodological_strength", label: "Method strength" },
  { key: "independent_confirmation", label: "Confirmation" },
  { key: "contradiction_level", label: "Contradiction" },
  { key: "overall", label: "Overall" },
];

export default function ClaimConfidenceBar({
  confidence,
}: {
  confidence: Confidence | null;
}) {
  if (confidence === null) {
    return (
      <span className="text-sm text-muted-foreground dark:text-zinc-400">
        unscored
      </span>
    );
  }
  return (
    <dl className="flex flex-col gap-1">
      {DIMS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2 text-xs">
          <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
          <Progress
            value={Math.round(confidence[key] * 100)}
            className="flex-1"
            aria-label={`${label} ${confidence[key].toFixed(2)}`}
          />
          <dd className="w-8 text-right tabular-nums">
            {confidence[key].toFixed(2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
