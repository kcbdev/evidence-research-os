"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { startRun } from "@/lib/api";

const MODES = ["research", "brainstorm", "academic"] as const;

export default function RunStartDialog({
  projectId,
  defaultQuestion,
  defaultMode,
  // PBI-056 slot: the methodology picker renders here (filtered by
  // mode). Today nothing passes it — no dead UI, just the seam.
  methodologyPicker,
  onStarted,
}: {
  projectId: string;
  defaultQuestion: string;
  defaultMode: string;
  methodologyPicker?: ReactNode;
  onStarted: (runId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(defaultQuestion);
  const [mode, setMode] = useState(
    (MODES as readonly string[]).includes(defaultMode) ? defaultMode : "research",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxCalls, setMaxCalls] = useState("");
  const [maxRounds, setMaxRounds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function onStart() {
    setStarting(true);
    setError(null);
    try {
      const budget: { max_model_calls?: number; max_research_rounds?: number } = {};
      const calls = Number(maxCalls);
      const rounds = Number(maxRounds);
      if (maxCalls.trim() !== "" && Number.isFinite(calls) && calls > 0) {
        budget.max_model_calls = calls;
      }
      if (maxRounds.trim() !== "" && Number.isFinite(rounds) && rounds > 0) {
        budget.max_research_rounds = rounds;
      }
      const run = await startRun(projectId, {
        question: question.trim() || undefined,
        mode,
        ...(Object.keys(budget).length > 0 ? { budget } : {}),
      });
      setOpen(false);
      onStarted(run.run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "start failed");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="min-h-[44px]">Start run</Button>} />
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start run</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rs-question">Question override</FieldLabel>
              <textarea
                id="rs-question"
                aria-label="Question override"
                className="min-h-24 rounded border bg-background px-2 py-1"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Mode</FieldLabel>
              <div className="flex gap-4" role="radiogroup" aria-label="Mode">
                {MODES.map((m) => (
                  <label key={m} className="flex min-h-[44px] items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="run-mode"
                      value={m}
                      checked={mode === m}
                      onChange={() => setMode(m)}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </Field>
            {methodologyPicker}
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced((s) => !s)}
              >
                {showAdvanced ? "Hide advanced" : "Advanced: budget override"}
              </Button>
            </div>
            {showAdvanced && (
              <>
                <Field>
                  <FieldLabel htmlFor="rs-calls">Max model calls</FieldLabel>
                  <Input id="rs-calls" aria-label="Max model calls" type="number" min={1} placeholder="project default" className="min-h-[44px]" value={maxCalls} onChange={(e) => setMaxCalls(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rs-rounds">Max research rounds</FieldLabel>
                  <Input id="rs-rounds" aria-label="Max research rounds" type="number" min={1} placeholder="project default" className="min-h-[44px]" value={maxRounds} onChange={(e) => setMaxRounds(e.target.value)} />
                </Field>
              </>
            )}
          </FieldGroup>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-[44px]" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="min-h-[44px]" disabled={starting} onClick={() => void onStart()}>
            {starting ? "Starting…" : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
