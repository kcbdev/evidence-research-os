"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getBudget,
  getLabProject,
  getReport,
  type Budget,
  type LabProjectDetail,
} from "@/lib/api";

type Tab = "claims" | "runs" | "output";

export default function LabOverview() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<LabProjectDetail | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("claims");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [p, b] = await Promise.all([getLabProject(id), getBudget(id)]);
      setProject(p);
      setBudget(b);
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

  if (error) return <main className="p-8 text-red-600">{error}</main>;
  if (!project || !budget) return <main className="p-8">Loading…</main>;

  return (
    <main className="mx-auto max-w-3xl p-8">
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

      <nav className="mt-4 flex gap-2" aria-label="Lab sections">
        {(["claims", "runs", "output"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded border px-3 py-1 capitalize ${
              tab === t ? "bg-zinc-900 text-white" : ""
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "claims" && (
        <section className="mt-4">
          <Link href={`/lab/${id}/claims`} className="underline">
            Open claims table →
          </Link>
          <p className="text-sm text-zinc-500">
            Filterable table with evidence trace (PBI-017).
          </p>
        </section>
      )}
      {tab === "runs" && (
        <section className="mt-4">
          <p className="text-sm text-zinc-500">
            Start runs and watch them live from the run view (PBI-018).
          </p>
        </section>
      )}
      {tab === "output" && (
        <section className="mt-4">
          {report === null ? (
            <p className="text-sm text-zinc-500">No report yet.</p>
          ) : (
            <pre className="whitespace-pre-wrap rounded border p-3 text-sm">
              {report}
            </pre>
          )}
        </section>
      )}
    </main>
  );
}
