"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  compileCondition,
  defaultRowFor,
  operatorsForFieldType,
  parseCondition,
  type ConditionFieldLite,
  type ConditionRow,
} from "@/lib/methodology-graph";

export const TOO_COMPLEX_NOTE =
  "This expression is too complex to edit visually — advanced mode only.";

interface ConditionBuilderProps {
  /** Reference rows from GET /methodologies/condition-fields. */
  fields: ConditionFieldLite[];
  /** Current stage loop_condition (null = none yet). */
  expression: string | null;
  /** Registry loop_while on the same stage, if any (conflict). */
  loopWhile: string | null;
  /** Loop edge/keys target stage id, if any (header display). */
  loopTarget: string | null;
  onChange: (expr: string | null) => void;
  onRemoveLoop: () => void;
}

/**
 * No-code loop-condition editor (PBI-068). Rows of
 * Field × Operator × Value compile client-side to the `simpleeval`
 * string stored as the stage's `loop_condition` (AND-chaining only).
 * The collapsed advanced toggle edits the raw expression: edits that
 * still parse round-trip into the rows, anything else disables the
 * rows with a note — never a silent rewrite.
 */
export default function ConditionBuilder({
  fields,
  expression,
  loopWhile,
  loopTarget,
  onChange,
  onRemoveLoop,
}: ConditionBuilderProps) {
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const conflict = loopWhile !== null;
  // Derived, never stored: rows always reflect the stored expression,
  // so reloads, selection switches, and advanced edits stay in sync.
  const parsed =
    expression === null || expression.trim() === ""
      ? ([] as ConditionRow[])
      : parseCondition(expression, fields);
  const tooComplex = parsed === null;
  const rows: ConditionRow[] = parsed ?? [];

  function setRows(next: ConditionRow[]) {
    onChange(compileCondition(next));
  }

  function addRow() {
    const row = defaultRowFor(fields);
    if (!row) return;
    setRows([...rows, row]);
  }

  function updateRow(index: number, patch: Partial<ConditionRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function switchRowField(index: number, field: string) {
    const fresh = defaultRowFor(fields, field);
    if (!fresh) return;
    setRows(rows.map((r, i) => (i === index ? fresh : r)));
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Repeat this stage while:</span>
        {loopTarget !== null && (
          <span className="font-mono text-xs text-muted-foreground">
            → {loopTarget}
          </span>
        )}
      </div>

      {conflict && (
        <p role="alert" className="text-sm text-destructive">
          Stage uses registry loop_while “{loopWhile}” — remove it via
          Import/Export to use the Condition Builder. Setting both is a
          validation error (loop_while and loop_condition are mutually
          exclusive).
        </p>
      )}

      {tooComplex && !conflict && (
        <p className="text-xs text-muted-foreground">{TOO_COMPLEX_NOTE}</p>
      )}

      <div className="flex flex-col gap-2" aria-disabled={tooComplex || conflict}>
        {rows.map((row, i) => {
          const fieldType = fields.find((f) => f.field === row.field)?.type;
          return (
            <div key={`${row.field}|${i}`} className="flex flex-wrap items-center gap-2">
              <Select
                value={row.field}
                disabled={tooComplex || conflict}
                onValueChange={(v) => {
                  if (v !== null) switchRowField(i, v);
                }}
              >
                <SelectTrigger
                  aria-label={`Condition field row ${i + 1}`}
                  className="min-h-[44px] min-w-[12rem] flex-1"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.field} value={f.field}>
                      <span className="font-mono">{f.field}</span>
                      <span className="ml-2 text-muted-foreground">{f.type}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.op}
                disabled={tooComplex || conflict}
                onValueChange={(v) => {
                  if (v === null) return;
                  if (v === "is true" || v === "is false") {
                    updateRow(i, { op: v, value: v === "is true" });
                  } else {
                    updateRow(i, { op: v });
                  }
                }}
              >
                <SelectTrigger
                  aria-label={`Condition operator row ${i + 1}`}
                  className="min-h-[44px] w-[8rem]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorsForFieldType(fieldType ?? "count").map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldType !== "bool" ? (
                <Input
                  type="number"
                  aria-label={`Condition value row ${i + 1}`}
                  className="min-h-[44px] w-[6rem]"
                  min={0}
                  step={1}
                  disabled={tooComplex || conflict}
                  value={typeof row.value === "number" ? row.value : 0}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    updateRow(i, { value: Number.isNaN(n) ? 0 : n });
                  }}
                />
              ) : (
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
                  <Switch
                    aria-label={`Condition value row ${i + 1}`}
                    checked={row.op === "is true"}
                    disabled={tooComplex || conflict}
                    onCheckedChange={(v) => {
                      updateRow(i, { op: v ? "is true" : "is false", value: v });
                    }}
                  />
                  {row.op === "is true" ? "true" : "false"}
                </label>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] min-w-[44px]"
                aria-label={`Remove condition row ${i + 1}`}
                disabled={tooComplex || conflict}
                onClick={() => removeRow(i)}
              >
                ×
              </Button>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && !tooComplex && !conflict && (
        <p className="text-xs text-muted-foreground">
          {fields.length === 0
            ? "No condition fields available — the reference endpoint did not load."
            : "No rows yet — add one to define the loop."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          disabled={tooComplex || conflict || fields.length === 0}
          title={
            tooComplex
              ? "Simplify the expression in advanced mode first — appending would discard it"
              : undefined
          }
          onClick={addRow}
        >
          + AND
        </Button>
        {(expression !== null || loopTarget !== null) && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={onRemoveLoop}
          >
            Remove loop
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] justify-start px-0"
          aria-expanded={advanced}
          onClick={() => {
            if (!advanced) setDraft(expression ?? "");
            else setDraft(null);
            setAdvanced(!advanced);
          }}
        >
          {advanced ? "▾" : "▸"} Advanced: edit as expression
        </Button>
        {advanced && (
          <>
            <Textarea
              aria-label="Loop condition expression"
              className="font-mono text-sm"
              rows={3}
              spellCheck={false}
              value={draft ?? ""}
              onChange={(e) => {
                setDraft(e.target.value);
                onChange(e.target.value === "" ? null : e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Raw simpleeval over state fields (e.g.{" "}
              <code className="font-mono">len(open_contradictions) &gt; 0</code>).
              Edits that still match a simple AND-chain round-trip into
              the rows above; anything else keeps the rows disabled.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
