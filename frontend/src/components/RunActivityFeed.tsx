"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default function RunActivityFeed({
  events,
}: {
  events: { node: string }[];
}) {
  if (events.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Waiting for activity…</EmptyTitle>
          <EmptyDescription>
            Node transitions appear here as the run executes.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {events.map((e, i) => (
        <li key={`${e.node}-${i}`} className="flex gap-2">
          <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="font-mono">{e.node}</span>
        </li>
      ))}
    </ol>
  );
}
