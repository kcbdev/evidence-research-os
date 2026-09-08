"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createLabProject, listLabProjects, type LabProjectSummary } from "@/lib/api";

export default function Dashboard() {
  const [projects, setProjects] = useState<LabProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [scientist, setScientist] = useState("");
  const [investigator, setInvestigator] = useState("");
  const [skeptic, setSkeptic] = useState("");
  const [judge, setJudge] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listLabProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const models = {
      scientist: scientist.trim(),
      investigator: investigator.trim(),
      skeptic: skeptic.trim(),
    };
    const judgeId = judge.trim();
    if (!title.trim() || !question.trim()) return;
    // Required model selection (PBI-028): runs refuse auto/auto, so the
    // form blocks empty model fields instead of shipping a dead project.
    if (!models.scientist || !models.investigator || !models.skeptic || !judgeId) {
      setError("Model selection is required — every role and the judge need an OpenRouter model ID.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createLabProject({
        title: title.trim(),
        question: question.trim(),
        council_models: models,
        judge_model: judgeId,
      });
      setTitle("");
      setQuestion("");
      setScientist("");
      setInvestigator("");
      setSkeptic("");
      setJudge("");
      await refresh(); // re-fetch: the new project appears, no reload hacks
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="flex flex-col gap-6" aria-label="Dashboard">
      <div>
        <h1 className="text-2xl font-semibold">Evidence Research OS</h1>
        <p className="text-sm text-muted-foreground">
          Lab Projects — one workspace per research question.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Lab Project</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="lp-title">Title</FieldLabel>
                <Input
                  id="lp-title"
                  aria-label="Project title"
                  placeholder="Title"
                  className="min-h-[44px]"                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lp-question">Research question</FieldLabel>
                <Input
                  id="lp-question"
                  aria-label="Research question"
                  placeholder="Research question"
                  className="min-h-[44px]"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lp-scientist">Scientist model</FieldLabel>
                <Input
                  id="lp-scientist"
                  aria-label="Scientist model"
                  placeholder="Scientist model (OpenRouter ID)"
                  className="font-mono min-h-[44px]"
                  value={scientist}
                  onChange={(e) => setScientist(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lp-investigator">Investigator model</FieldLabel>
                <Input
                  id="lp-investigator"
                  aria-label="Investigator model"
                  placeholder="Investigator model (OpenRouter ID)"
                  className="font-mono min-h-[44px]"
                  value={investigator}
                  onChange={(e) => setInvestigator(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lp-skeptic">Skeptic model</FieldLabel>
                <Input
                  id="lp-skeptic"
                  aria-label="Skeptic model"
                  placeholder="Skeptic model (OpenRouter ID)"
                  className="font-mono min-h-[44px]"
                  value={skeptic}
                  onChange={(e) => setSkeptic(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lp-judge">Judge model</FieldLabel>
                <Input
                  id="lp-judge"
                  aria-label="Judge model"
                  placeholder="Judge model (OpenRouter ID, must differ)"
                  className="font-mono min-h-[44px]"
                  value={judge}
                  onChange={(e) => setJudge(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={creating} className="min-h-[44px]">
                {creating ? "Creating…" : "Create"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loading && !error && projects.filter((p) => !p.archived).length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No Lab Projects yet</EmptyTitle>
            <EmptyDescription>
              Create one above to start researching.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!loading && !error && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects
            .filter((p) => !p.archived)
            .map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  <Link href={`/lab/${p.id}`} className="underline">
                    {p.title}
                  </Link>
                </CardTitle>
                <CardDescription>{p.question}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Badge variant="secondary">{p.mode}</Badge>
                <span className="text-sm text-muted-foreground">
                  {p.claims_count} claims
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
