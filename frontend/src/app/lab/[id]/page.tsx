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
  updateModels,
  type Budget,
  type LabProjectDetail,
  type RunSummary,
} from "@/lib/api";
import RunStartDialog from "@/components/RunStartDialog";

type Tab = "claims" | "runs" | "output" | "settings" | "ideas";

const TABS: { key: Tab; label: (counts: { claims: number; runs: number; ideas: number }) => string; show?: (p: { mode: string; ideas: number }) => boolean }[] = [
  { key: "claims", label: (c) => `Claims (${c.claims})` },
  { key: "runs", label: (c) => `Runs (${c.runs})` },
  // PBI-037: Ideas tab renders only for brainstorm-relevant projects.
  // No mode-history API exists, so the proxy is: current mode is
  // brainstorm OR the project already holds ideas (a past brainstorm
  // run). Documented here, not tribal knowledge.
  { key: "ideas", label: (c) => `Ideas (${c.ideas})`, show: (p) => p.mode === "brainstorm" || p.ideas > 0 },
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
  const [mScientist, setMScientist] = useState("");
  const [mInvestigator, setMInvestigator] = useState("");
  const [mSkeptic, setMSkeptic] = useState("");
  const [mIdeator, setMIdeator] = useState("");
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
        setReport((await getReport(id)).markdown);
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
      setMIdeator(project.council_models.ideator ?? "");
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

  const counts = { claims: project.counts.claims, runs: runs.length, ideas: project.counts.ideas };
  const visibleTabs = TABS.filter((t) => !t.show || t.show({ mode: project.mode, ideas: project.counts.ideas }));

  return (
    <main className="flex flex-col gap-6" aria-label="Lab overview">
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
            <p className="mt-2">
              <Badge variant="outline">Budget exhausted — runs end cleanly.</Badge>
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <div className="overflow-x-auto">
          <TabsList aria-label="Lab sections">
            {visibleTabs.map(({ key, label }) => (
              <TabsTrigger key={key} value={key} className="min-h-[44px]">
                {label(counts)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="claims">
          <Card>
            <CardContent>
              <Link href={`/lab/${id}/claims`} className="underline">
                Open claims table →
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {(project.mode === "brainstorm" || project.counts.ideas > 0) && (
          <TabsContent value="ideas">
            <Card>
              <CardContent>
                <Link href={`/lab/${id}/ideas`} className="underline">
                  Open ideas board →
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="runs">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <RunStartDialog
                projectId={id}
                defaultQuestion={project.question}
                defaultMode={project.mode}
                onStarted={(runId) => router.push(`/lab/${id}/runs/${runId}`)}
              />
              <Link href={`/lab/${id}/runs`} className="underline text-sm">
                Full history →
              </Link>
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
                    History appears here (newest first) and survives
                    backend restarts.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
            <div className="overflow-x-auto">
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
            </div>
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
                <Link href={`/lab/${id}/output`} className="underline">
                  Open full report →
                </Link>
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
                      ideator: mIdeator.trim(),
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
                  className="min-h-[44px] font-mono"
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
                  className="min-h-[44px] font-mono"
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
                  className="min-h-[44px] font-mono"
                      value={mSkeptic}
                      onChange={(e) => setMSkeptic(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="m-ideator">Ideator model</FieldLabel>
                    <Input
                      id="m-ideator"
                      aria-label="Ideator model"
                      placeholder="Ideator model (brainstorm runs)"
                  className="min-h-[44px] font-mono"
                      value={mIdeator}
                      onChange={(e) => setMIdeator(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="m-judge">Judge model</FieldLabel>
                    <Input
                      id="m-judge"
                      aria-label="Judge model"
                      placeholder="Judge model (must differ)"
                  className="min-h-[44px] font-mono"
                      value={mJudge}
                      onChange={(e) => setMJudge(e.target.value)}
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={saving} className="min-h-[44px]">
                      {saving ? "Saving…" : "Save models"}
                    </Button>
              {saved && (
                <Badge variant="secondary" className="ml-2">
                  Saved.
                </Badge>
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
    </main>
  );
}
