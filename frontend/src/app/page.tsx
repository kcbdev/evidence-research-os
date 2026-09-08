"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Evidence Research OS</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Lab Projects — one workspace per research question.
      </p>

      <form onSubmit={onCreate} className="mt-6 rounded border p-4">
        <h2 className="font-medium">New Lab Project</h2>
        <input
          aria-label="Project title"
          className="mt-2 w-full rounded border px-2 py-1"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          aria-label="Research question"
          className="mt-2 w-full rounded border px-2 py-1"
          placeholder="Research question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            aria-label="Scientist model"
            className="rounded border px-2 py-1 font-mono text-sm"
            placeholder="Scientist model (OpenRouter ID)"
            value={scientist}
            onChange={(e) => setScientist(e.target.value)}
          />
          <input
            aria-label="Investigator model"
            className="rounded border px-2 py-1 font-mono text-sm"
            placeholder="Investigator model (OpenRouter ID)"
            value={investigator}
            onChange={(e) => setInvestigator(e.target.value)}
          />
          <input
            aria-label="Skeptic model"
            className="rounded border px-2 py-1 font-mono text-sm"
            placeholder="Skeptic model (OpenRouter ID)"
            value={skeptic}
            onChange={(e) => setSkeptic(e.target.value)}
          />
          <input
            aria-label="Judge model"
            className="rounded border px-2 py-1 font-mono text-sm"
            placeholder="Judge model (OpenRouter ID, must differ)"
            value={judge}
            onChange={(e) => setJudge(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="mt-2 rounded bg-zinc-900 px-4 py-1 text-white disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>

      {loading && <p className="mt-4">Loading…</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}
      <ul className="mt-4 space-y-2">
        {projects.map((p) => (
          <li key={p.id} className="rounded border p-3">
            <Link href={`/lab/${p.id}`} className="font-medium underline">
              {p.title}
            </Link>
            <span className="ml-2 text-xs text-zinc-500">{p.mode}</span>
            <p className="text-sm text-zinc-600">{p.question}</p>
            <p className="text-xs text-zinc-500">{p.claims_count} claims</p>
          </li>
        ))}
      </ul>
      {!loading && !error && projects.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500">No Lab Projects yet.</p>
      )}
    </main>
  );
}
