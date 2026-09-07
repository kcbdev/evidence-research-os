"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getBudget,
  getLabProject,
  getReport,
  listRuns,
  startRun,
  type Budget,
  type LabProjectDetail,
  type RunSummary,
} from "@/lib/api";
import Markdown from "@/components/Markdown";

type Tab = "claims" | "runs" | "output";

const TABS: { key: Tab; label: (counts: { claims: number; runs: number }) => string }[] = [
  { key: "claims", label: (c) => `Claims (${c.claims})` },
  { key: "runs", label: (c) => `Runs (${c.runs})` },
  { key: "output", label: () => "Output" },
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

  if (error) return <main className="mx-auto max-w-4xl p-8 text-red-600">{error}</main>;
  if (!project || !budget)
    return <main className="mx-auto max-w-4xl p-8">Loading…</main>;

  const counts = { claims: project.counts.claims, runs: runs.length };

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/" className="text-sm underline">
        ← Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{project.title}</h1>
      <p className="mt-1 text-zinc-600">{project.question}</p>
      <p className="mt-1 text-xs text-zinc-500">
        mode: {project.mode} · {project.counts.claims} claims ·{" "}
        {project.counts.evidence} evidence · {project.counts.sources} sources
      </p>

      <section aria-label="Budget" className="mt-4 rounded border p-3">
        <h2 className="font-medium">Budget</h2>
        <p className="text-sm">
          Calls {budget.calls_used}/{budget.max_model_calls} · Rounds{" "}
          {budget.rounds_used}/{budget.max_research_rounds}
        </p>
        {budget.exhausted && (
          <p className="text-sm font-medium text-amber-700">
            Budget exhausted — runs end cleanly.
          </p>
        )}
      </section>

      <div role="tablist" aria-label="Lab sections" className="mt-4 flex gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded border px-3 py-1 ${
              tab === key ? "bg-zinc-900 text-white" : ""
            }`}
          >
            {label(counts)}
          </button>
        ))}
      </div>

      {tab === "claims" && (
        <section role="tabpanel" className="mt-4">
          <Link href={`/lab/${id}/claims`} className="underline">
            Open claims table →
          </Link>
        </section>
      )}
      {tab === "runs" && (
        <section role="tabpanel" className="mt-4 space-y-3">
          <button
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
            className="rounded bg-zinc-900 px-4 py-1 text-white disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start run"}
          </button>
          {runsFailed ? (
            <p className="text-sm text-red-600">
              Couldn’t load run history.
            </p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No runs yet. History appears here (newest first); it resets
              if the backend restarts.
            </p>
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li key={run.run_id} className="rounded border p-3 text-sm">
                  <Link
                    href={`/lab/${id}/runs/${run.run_id}`}
                    className="font-mono underline"
                  >
                    {run.run_id}
                  </Link>
                  <span className="ml-2">{run.status}</span>
                  {run.needs_approval && (
                    <span className="ml-2 font-medium text-amber-700">
                      needs approval
                    </span>
                  )}
                  <span className="ml-2 text-zinc-500">
                    {run.events_count} events
                  </span>
                  {run.error && (
                    <p className="text-red-600">{run.error}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {tab === "output" && (
        <section role="tabpanel" className="mt-4">
          {report === null ? (
            <p className="text-sm text-zinc-500">No report yet.</p>
          ) : (
            <article className="rounded border p-4">
              <Markdown text={report} />
            </article>
          )}
        </section>
      )}
    </main>
  );
}
