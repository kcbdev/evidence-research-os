"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { CustomNodeInfo, LibraryRoleEntry } from "@/lib/api";
import { BUILT_IN_STAGES } from "@/lib/methodology-graph";

/** "+ Add Node" palette: stages, library roles, discovered code. */
export default function NodePalette({
  open,
  onOpenChange,
  onPick,
  roles,
  customNodes,
  onPickRole,
  onPickCode,
  onCreateRole,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (node: string) => void;
  roles: LibraryRoleEntry[];
  customNodes: CustomNodeInfo[];
  onPickRole: (roleId: string) => void;
  onPickCode: (nodeId: string) => void;
  onCreateRole: () => void;
}) {
  const placeable = customNodes.filter(
    (c) => c.node_id !== null && c.load_error === null,
  );
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Search stages…" aria-label="Search stages" />
        <CommandList>
          <CommandEmpty>No matching entry.</CommandEmpty>
          <CommandGroup heading="Built-in Stages">
            {BUILT_IN_STAGES.map((s) => (
              <CommandItem
                key={s.node}
                value={s.node}
                onSelect={(v) => {
                  onPick(v);
                  onOpenChange(false);
                }}
              >
                {s.label}
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {s.node}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Custom Roles">
            <CommandItem
              value="__new_role__"
              keywords={["create", "new", "role"]}
              onSelect={() => {
                onCreateRole();
              }}
            >
              + Create new custom role
            </CommandItem>
            {roles.map((r) => (
              <CommandItem
                key={r.id}
                value={r.id}
                keywords={[r.name]}
                onSelect={(v) => {
                  onPickRole(v);
                  onOpenChange(false);
                }}
              >
                {r.name}
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {r.id}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Custom Code (discovered)">
            {placeable.length === 0 && (
              <CommandItem value="__no_code__" disabled>
                No custom nodes discovered
              </CommandItem>
            )}
            {placeable.map((c) => (
              <CommandItem
                key={c.node_id as string}
                value={c.node_id as string}
                keywords={[c.filename]}
                onSelect={(v) => {
                  onPickCode(v);
                  onOpenChange(false);
                }}
              >
                {c.filename}
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {c.node_id}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
