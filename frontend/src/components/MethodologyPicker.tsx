"use client";

import { useEffect, useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listMethodologies, type MethodologySummary } from "@/lib/api";

export default function MethodologyPicker({
  mode,
  value,
  onChange,
}: {
  mode: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [options, setOptions] = useState<MethodologySummary[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMethodologies()
      .then((all) => {
        if (!cancelled) setOptions(all.filter((m) => m.compatible_modes.includes(mode)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Empty value = mode default (the common case); the picker only
  // overrides when the operator chooses otherwise.
  const current = value || "__default__";

  return (
    <Field>
      <FieldLabel htmlFor="methodology-picker">Methodology</FieldLabel>
      {failed ? (
        <p className="text-sm text-muted-foreground">
          Methodology list unavailable — runs use the mode default.
        </p>
      ) : (
        <Select
          value={current}
          onValueChange={(v) => onChange(v === "__default__" ? "" : (v ?? ""))}
        >
          <SelectTrigger id="methodology-picker" aria-label="Methodology" className="min-h-[44px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">Mode default</SelectItem>
            {options.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}{m.is_default ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
