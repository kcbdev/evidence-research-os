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
import { BUILT_IN_STAGES } from "@/lib/methodology-graph";

/** "+ Add Node" palette — built-in stages only (PBI-067 adds roles/code). */
export default function NodePalette({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (node: string) => void;
}) {
  // NOTE: items must live inside <Command> (the cmdk store provider) —
  // the vendored CommandDialog intentionally leaves that to the caller.
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Search stages…" aria-label="Search stages" />
        <CommandList>
          <CommandEmpty>No matching stage.</CommandEmpty>
          <CommandGroup heading="Built-in Stages">
            {/* cmdk option rows are intentionally compact (py-1.5):
                dropdown options are the standard touch-target
                exception, consistent with the app's Select items. */}
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
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
