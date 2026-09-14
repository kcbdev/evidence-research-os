"use client";

export interface ConsensusValue {
  supporting_weight: number;
  opposing_weight: number;
  percent_support: number | null;
}

export default function ConsensusMeter({
  consensus,
}: {
  // Optional: the modal never hard-crashes on a missing field (stale
  // caches, mixed-version backends) — absence renders as no weight.
  consensus?: ConsensusValue | null;
}) {
  const supporting = consensus?.supporting_weight ?? 0;
  const opposing = consensus?.opposing_weight ?? 0;
  const pct = consensus?.percent_support ?? null;
  // Weightless: show the absence, never a fake 50/50 split (the guide
  // sketch defaults to 50 — that implies a balance no source attests).
  if (supporting + opposing <= 0 || pct === null) {
    return (
      <span className="text-sm text-muted-foreground">
        no weighted sources
      </span>
    );
  }
  return (
    <div
      className="flex flex-col gap-1"
      role="img"
      aria-label={`Consensus ${pct.toFixed(1)}% supporting (${supporting} vs ${opposing} tier weight)`}
    >
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${pct}%` }} />
        <div className="bg-amber-500" style={{ width: `${100 - pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {pct.toFixed(1)}% supporting
      </span>
    </div>
  );
}
