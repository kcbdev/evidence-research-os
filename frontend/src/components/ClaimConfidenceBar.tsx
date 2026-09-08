"use client";

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
    return <span className="text-sm text-zinc-500">unscored</span>;
  }
  return (
    <dl className="space-y-1">
      {DIMS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2 text-xs">
          <dt className="w-28 shrink-0 text-zinc-600 dark:text-zinc-400">{label}</dt>
          <dd className="h-2 flex-1 rounded bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-2 rounded bg-zinc-800 dark:bg-zinc-200"
              style={{ width: `${Math.round(confidence[key] * 100)}%` }}
            />
          </dd>
          <dd className="w-8 text-right tabular-nums">
            {confidence[key].toFixed(2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
