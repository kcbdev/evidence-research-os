"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createLabProject, startRun } from "@/lib/api";
import MethodologyPicker from "@/components/MethodologyPicker";

const MODES = ["research", "brainstorm", "academic"] as const;

export default function NewLabPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]>("research");
  const [models, setModels] = useState({ scientist: "", investigator: "", skeptic: "", ideator: "", judge: "" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxCalls, setMaxCalls] = useState("50");
  const [maxRounds, setMaxRounds] = useState("5");
  const [methodologyId, setMethodologyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function setModel(role: keyof typeof models, value: string) {
    setModels((m) => ({ ...m, [role]: value }));
  }

  async function create(startImmediately: boolean) {
    if (!title.trim() || !question.trim()) {
      setError("Title and question are required.");
      return;
    }
    const council_models: Record<string, string> = {};
    for (const [role, id] of Object.entries(models)) {
      if (role === "judge") continue;
      if (!id.trim()) {
        setError("Model selection is required — every role and the judge need an OpenRouter model ID.");
        return;
      }
      council_models[role] = id.trim();
    }
    if (!models.judge.trim()) {
      setError("Model selection is required — every role and the judge need an OpenRouter model ID.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const project = await createLabProject({
        title: title.trim(),
        question: question.trim(),
        mode,
        council_models,
        judge_model: models.judge.trim(),
        ...(methodologyId ? { methodology_id: methodologyId } : {}),
      });
      if (!startImmediately) {
        router.push(`/lab/${project.id}`);
        return;
      }
      // Batch-review nit: only forward budget keys the operator
      // touched — untouched defaults stay absent so the methodology
      // chain resolves them (identical outcome, cleaner payload).
      const budget: { max_model_calls?: number; max_research_rounds?: number } = {};
      const calls = Number(maxCalls);
      const rounds = Number(maxRounds);
      if (maxCalls.trim() !== "" && maxCalls.trim() !== "50" && Number.isFinite(calls) && calls > 0) {
        budget.max_model_calls = calls;
      }
      if (maxRounds.trim() !== "" && maxRounds.trim() !== "5" && Number.isFinite(rounds) && rounds > 0) {
        budget.max_research_rounds = rounds;
      }
      const run = await startRun(project.id, {
        mode,
        ...(Object.keys(budget).length > 0 ? { budget } : {}),
      });
      router.push(`/lab/${project.id}/runs/${run.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="flex flex-col gap-6" aria-label="New Lab Project">
      <div>
        <Link href="/" className="text-sm underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New Lab Project</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <form onSubmit={(e) => e.preventDefault()}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="nl-title">Title</FieldLabel>
                <Input id="nl-title" aria-label="Project title" placeholder="Title" className="min-h-[44px]" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="nl-question">Initial question</FieldLabel>
                <textarea
                  id="nl-question"
                  aria-label="Initial question"
                  placeholder="What should this project find out?"
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
                        name="mode"
                        value={m}
                        checked={mode === m}
                        onChange={() => setMode(m)}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </Field>
              {(["scientist", "investigator", "skeptic", "ideator"] as const).map((role) => (
                <Field key={role}>
                  <FieldLabel htmlFor={`nl-${role}`}>{role[0].toUpperCase() + role.slice(1)} model</FieldLabel>
                  <Input
                    id={`nl-${role}`}
                    aria-label={`${role[0].toUpperCase() + role.slice(1)} model`}
                    placeholder={`${role} model (OpenRouter ID)`}
                    className="font-mono min-h-[44px]"
                    value={models[role]}
                    onChange={(e) => setModel(role, e.target.value)}
                  />
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor="nl-judge">Judge model</FieldLabel>
                <Input
                  id="nl-judge"
                  aria-label="Judge model"
                  placeholder="Judge model (OpenRouter ID, must differ)"
                  className="font-mono min-h-[44px]"
                  value={models.judge}
                  onChange={(e) => setModel("judge", e.target.value)}
                />
              </Field>
              <MethodologyPicker
                mode={mode}
                value={methodologyId}
                onChange={setMethodologyId}
              />
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  aria-expanded={showAdvanced}
                  onClick={() => setShowAdvanced((s) => !s)}
                >
                  {showAdvanced ? "Hide advanced" : "Advanced: budget"}
                </Button>
              </div>
              {showAdvanced && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Applies when starting a run immediately below; plain
                    creation keeps project defaults.
                  </p>
                  <Field>
                    <FieldLabel htmlFor="nl-calls">Max model calls</FieldLabel>
                    <Input id="nl-calls" aria-label="Max model calls" type="number" min={1} className="min-h-[44px]" value={maxCalls} onChange={(e) => setMaxCalls(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="nl-rounds">Max research rounds</FieldLabel>
                    <Input id="nl-rounds" aria-label="Max research rounds" type="number" min={1} className="min-h-[44px]" value={maxRounds} onChange={(e) => setMaxRounds(e.target.value)} />
                  </Field>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={creating} className="min-h-[44px]" onClick={() => void create(false)}>
                  {creating ? "Creating…" : "Create"}
                </Button>
                <Button disabled={creating} variant="secondary" className="min-h-[44px]" onClick={() => void create(true)}>
                  Create and start run
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
