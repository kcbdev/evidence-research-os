"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { searchProjects, type SearchHit } from "@/lib/api";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setHits(await searchProjects(q.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "search failed");
      setHits(null);
    } finally {
      setLoading(false);
    }
  }

  const groups = new Map<string, { title: string; hits: SearchHit[] }>();
  for (const h of hits ?? []) {
    const g = groups.get(h.project_id) ?? { title: h.project_title, hits: [] };
    g.hits.push(h);
    groups.set(h.project_id, g);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-sm underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Cross-project search</h1>
        <p className="text-sm text-muted-foreground">
          Semantic search across every Lab Project&apos;s evidence.
        </p>
      </div>

      <form onSubmit={(e) => void onSearch(e)} className="flex gap-2" aria-label="Search">
        <Input
          aria-label="Search query"
          placeholder="e.g. microbe replication"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-[44px]"
        />
        <Button type="submit" className="min-h-[44px]" disabled={loading || !q.trim()}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {loading && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Search failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loading && !error && hits !== null && hits.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>
              Nothing in the shared index matches. Projects appear after
              their first indexed run — or ask an operator to backfill.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!loading && !error && hits !== null && hits.length > 0 && (
        <div className="flex flex-col gap-4">
          {[...groups].map(([pid, g]) => (
            <Card key={pid}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/lab/${pid}`} className="underline">
                    {g.title}
                  </Link>{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({g.hits.length} {g.hits.length === 1 ? "hit" : "hits"})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3">
                  {g.hits.map((h, i) => (
                    <li key={`${h.claim_id ?? h.matching_text}|${i}`} className="text-sm">
                      <p className="whitespace-pre-wrap">{h.matching_text}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        score {h.score.toFixed(3)}
                        {h.claim_id ? (
                          <>
                            {" · "}
                            <Link
                              href={`/lab/${pid}/claims?claim=${h.claim_id}`}
                              className="underline"
                              aria-label={`Open ${h.claim_id} in ${g.title} claims`}
                            >
                              {h.claim_id} in claims →
                            </Link>
                          </>
                        ) : (
                          <> · evidence-level hit</>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
