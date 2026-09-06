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
    if (!title.trim() || !question.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createLabProject({ title: title.trim(), question: question.trim() });
      setTitle("");
      setQuestion("");
      await refresh(); // re-fetch: the new project appears, no reload hacks
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
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
