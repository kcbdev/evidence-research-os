"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { FileCode2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "cn";
import type { StageNode } from "@/lib/methodology-graph";

export default function CustomCodeCard({ id, data, selected }: NodeProps<StageNode>) {
  const { deleteElements } = useReactFlow();
  return (
    <Card
      className={cn("w-55 p-3", selected && "ring-2 ring-primary")}
      data-testid={`code-card-${id}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <FileCode2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium">{data.filename ?? data.node}</p>
          <div className="mt-1">
            <Badge variant="outline">Authored in code</Badge>
          </div>
        </div>
        <button
          type="button"
          aria-label={`Delete ${data.filename ?? data.node}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={() => void deleteElements({ nodes: [{ id }] })}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </Card>
  );
}
