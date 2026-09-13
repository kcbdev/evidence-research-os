"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "cn";
import { LOOP_HANDLE_ID, type StageNode } from "@/lib/methodology-graph";

export default function RoleCard({ id, data, selected }: NodeProps<StageNode>) {
  const { deleteElements } = useReactFlow();
  return (
    <Card
      className={cn("w-55 p-3", selected && "ring-2 ring-primary")}
      data-testid={`role-card-${id}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{data.roleName ?? data.label}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {data.node}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {data.model || "inherits"}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {data.toolCount ?? 0} tools
            </Badge>
          </div>
        </div>
        <button
          type="button"
          aria-label={`Delete ${data.roleName ?? data.label}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={() => void deleteElements({ nodes: [{ id }] })}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} />
      {/* Loop-back handle (PBI-068): offset so it never overlaps the chain handle. */}
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
