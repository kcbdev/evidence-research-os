"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getBudget,
  getLabProject,
  getReport,
  listRuns,
  startRun,
  updateModels,
  type Budget,
  type LabProjectDetail,
  type RunSummary,
} from "@/lib/api";
import Markdown from "@/components/Markdown";

type Tab = "claims" | "runs" | "output" | "settings";

const TABS: { key: Tab; label: (counts: { claims: number; runs: number }) => string }[] = [
  { key: "claims", label: (c) => `Claims (${c.claims})` },
  { key: "runs", label: (c) => `Runs (${c.runs})` },
  { key: "output", label: () => "Output" },
  { key: "settings", label: () => "Settings" },
];

export default function LabOverview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<LabProjectDetail | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsFailed, setRunsFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("claims");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [mScientist, setMScientist] = useState("");
  const [mInvestigator, setMInvestigator] = useState("");
  const [mSkeptic, setMSkeptic] = useState("");
  const [mJudge, setMJudge] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [p, b] = await Promise.all([getLabProject(id), getBudget(id)]);
      setProject(p);
      setBudget(b);
      try {
        setRuns(await listRuns(id));
        setRunsFailed(false);
      } catch {
        setRunsFailed(true); // history unavailable — not "no runs yet"
      }
      try {
        setReport((await getReport(id)).report);
      } catch {
        setReport(null); // 404 until synthesis runs — normal, not an error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (project) {
      setMScientist(project.council_models.scientist ?? "");
      setMInvestigator(project.council_models.investigator ?? "");
      setMSkeptic(project.council_models.skeptic ?? "");
      setMJudge(project.judge_model ?? "");
    }
  }, [project]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!project || !budget)
    return (
      <div className="flex flex-col gap-2" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-32" />
      </div>
    );

  const counts = { claims: project.counts.claims, runs: runs.length };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{project.title}</h1>
        <p className="mt-1 text-muted-foreground">{project.question}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          mode: {project.mode} · {project.counts.claims} claims ·{" "}
          {project.counts.evidence} evidence · {project.counts.sources} sources
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Calls {budget.calls_used}/{budget.max_model_calls} · Rounds{" "}
            {budget.rounds_used}/{budget.max_research_rounds}
          </p>
          {budget.exhausted && (
            <p className="text-sm font-medium text-amber-700">
              Budget exhausted — runs end cleanly.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList aria-label="Lab sections">
          {TABS.map(({ key, label }) => (
            <TabsTrigger key={key} value={key}>
              {label(counts)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="claims">
          <Card>
            <CardContent>
              <Link href={`/lab/${id}/claims`} className="underline">
                Open claims table →
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <div className="flex flex-col gap-4">
            <div>
              <Button
                disabled={starting}
                onClick={() => {
                  setStarting(true);
                  setError(null);
                  startRun(id).then(
                    (run) => router.push(`/lab/${id}/runs/${run.run_id}`),
                    (err: unknown) => {
                      setError(
                        err instanceof Error ? err.message : "start failed",
                      );
                      setStarting(false);
                    },
                  );
                }}
              >
                {starting ? "Starting…" : "Start run"}
              </Button>
            </div>
            {runsFailed ? (
              <Alert variant="destructive">
                <AlertTitle>History unavailable</AlertTitle>
                <AlertDescription>Couldn’t load run history.</AlertDescription>
              </Alert>
            ) : runs.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No runs yet</EmptyTitle>
                  <EmptyDescription>
                    History appears here (newest first); it resets if the
                    backend restarts.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.run_id}>
                      <TableCell className="font-mono">
                        <Link
                          href={`/lab/${id}/runs/${run.run_id}`}
                          className="underline"
                        >
                          {run.run_id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            run.status === "failed" ? "destructive" : "secondary"
                          }
                        >
                          {run.status}
                        </Badge>
                        {run.needs_approval && (
                          <Badge variant="outline" className="ml-2">
                            needs approval
                          </Badge>
                        )}
                        {run.error && (
                          <p className="text-destructive text-sm">{run.error}</p>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {run.events_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="output">
          {report === null ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No report yet</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Card>
              <CardContent>
                <Markdown text={report} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Model assignment</CardTitle>
              <CardDescription>
                OpenRouter model IDs. The judge must differ from every
                council model, or runs refuse to start.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSaving(true);
                  setSaved(false);
                  setSaveError(null);
                  updateModels(id, {
                    council_models: {
                      scientist: mScientist.trim(),
                      investigator: mInvestigator.trim(),
                      skeptic: mSkeptic.trim(),
                    },
                    judge_model: mJudge.trim(),
                  }).then(
                    async () => {
                      setSaving(false);
                      setSaved(true);
                      await refresh();
                    },
                    (err: unknown) => {
                      setSaving(false);
                      setSaveError(
                        err instanceof Error ? err.message : "save failed",
                      );
                    },
                  );
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="m-scientist">Scientist model</FieldLabel>
                    <Input
                      id="m-scientist"
                      aria-label="Scientist model"
                      placeholder="Scientist model"
                      className="font-mono"
                      value={mScientist}
                      onChange={(e) => setMScientist(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="m-investigator">Investigator model</FieldLabel>
                    <Input
                      id="m-investigator"
                      aria-label="Investigator model"
                      placeholder="Investigator model"
                      className="font-mono"
                      value={mInvestigator}
                      onChange={(e) => setMInvestigator(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="m-skeptic">Skeptic model</FieldLabel>
                    <Input
                      id="m-skeptic"
                      aria-label="Skeptic model"
                      placeholder="Skeptic model"
                      className="font-mono"
                      value={mSkeptic}
                      onChange={(e) => setMSkeptic(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="m-judge">Judge model</FieldLabel>
                    <Input
                      id="m-judge"
                      aria-label="Judge model"
                      placeholder="Judge model (must differ)"
                      className="font-mono"
                      value={mJudge}
                      onChange={(e) => setMJudge(e.target.value)}
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save models"}
                    </Button>
                    {saved && (
                      <span className="text-sm text-green-700">Saved.</span>
                    )}
                  </div>
                  {saveError && (
                    <p className="text-sm text-destructive">{saveError}</p>
                  )}
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
