"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Workflow, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "cn";
import { LOOP_HANDLE_ID, type StageNode } from "@/lib/methodology-graph";

export default function StageCard({ id, data, selected }: NodeProps<StageNode>) {
  const { deleteElements } = useReactFlow();
  return (
    <Card
      className={cn("w-55 p-3", selected && "ring-2 ring-primary")}
      data-testid={`stage-card-${id}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <Workflow className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{data.label}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {data.node}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Delete ${data.label}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={() => void deleteElements({ nodes: [{ id }] })}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} />
      {/* Loop-back handle (PBI-068): a second, distinctly styled source.
          Offset from center so it never overlaps the chain handle. */}
      <Handle
        type="source"
        position={Position.Bottom}
        id={LOOP_HANDLE_ID}
        className="!bg-amber-500"
        style={{ left: "auto", right: 12 }}
        title="Loop-back: drag onto a stage to repeat while a condition holds"
        aria-label="Loop-back handle: drag onto a stage to repeat while a condition holds"
      />
    </Card>
  );
}
