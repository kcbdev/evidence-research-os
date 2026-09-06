"use client";

export default function RunActivityFeed({
  events,
}: {
  events: { node: string }[];
}) {
  if (events.length === 0) {
    return <p className="text-sm text-zinc-500">Waiting for activity…</p>;
  }
  return (
    <ol className="space-y-1 text-sm">
      {events.map((e, i) => (
        <li key={`${e.node}-${i}`} className="flex gap-2">
          <span className="w-8 shrink-0 tabular-nums text-zinc-400">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="font-mono">{e.node}</span>
        </li>
      ))}
    </ol>
  );
}
