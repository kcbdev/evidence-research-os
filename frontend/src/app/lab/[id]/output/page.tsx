"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { addProductNote, getReport } from "@/lib/api";
import Markdown from "@/components/Markdown";

type Header = { level: number; text: string; index: number };

function extractHeaders(markdown: string): Header[] {
  const out: Header[] = [];
  let index = 0;
  for (const line of markdown.split("\n")) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (m) out.push({ level: m[1].length, text: m[2].trim(), index: index++ });
  }
  return out;
}

export default function OutputPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [linkedArea, setLinkedArea] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promotedId, setPromotedId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReport(id);
      setMarkdown(res.markdown);
      setGeneratedAt(res.generated_at);
    } catch {
      setMarkdown(null); // 404 until synthesis runs — normal
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function scrollToHeader(index: number) {
    const els = articleRef.current?.querySelectorAll("h1, h2, h3");
    els?.[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportMarkdown() {
    if (markdown === null) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onPromote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setPromoting(true);
    setPromoteError(null);
    try {
      const created = await addProductNote(id, {
        note: note.trim(),
        ...(linkedArea.trim() ? { linked_area: linkedArea.trim() } : {}),
      });
      setPromotedId(created.id);
      setNote("");
      setLinkedArea("");
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : "promote failed");
    } finally {
      setPromoting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (markdown === null) {
    return (
      <div className="p-4">
        <Link href={`/lab/${id}`} className="text-sm underline">
          ← Lab overview
        </Link>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No report yet</EmptyTitle>
            <EmptyDescription>
              Reports appear after a run completes synthesis.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => router.push(`/lab/${id}`)} className="min-h-[44px]">
            Back to Overview to start a run
          </Button>
        </Empty>
      </div>
    );
  }

  const headers = extractHeaders(markdown);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/lab/${id}`} className="text-sm underline">
            ← Lab overview
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Final report</h1>
          {generatedAt && (
            <p className="text-xs text-muted-foreground">generated {generatedAt}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-[44px]" onClick={exportMarkdown}>
            Export Markdown
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {headers.length > 0 && (
          <nav aria-label="Table of contents" className="lg:w-64 lg:shrink-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contents</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm">
                  {headers.map((h) => (
                    <li key={h.index} style={{ paddingLeft: (h.level - 1) * 12 }}>
                      <button
                        className="underline text-left min-h-[44px] lg:min-h-0"
                        onClick={() => scrollToHeader(h.index)}
                      >
                        {h.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </nav>
        )}

        <article ref={articleRef} className="flex-1 min-w-0">
          <Card>
            <CardContent className="pt-6">
              <Markdown text={markdown} />
            </CardContent>
          </Card>
        </article>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promote to product</CardTitle>
        </CardHeader>
        <CardContent>
          {promotedId ? (
            <Alert>
              <AlertTitle>Note {promotedId} recorded</AlertTitle>
              <AlertDescription>
                It lives in this project&apos;s product notes for handoff.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={(e) => void onPromote(e)} className="flex flex-col gap-3">
              {promoteError && (
                <Alert variant="destructive">
                  <AlertTitle>Promote failed</AlertTitle>
                  <AlertDescription>{promoteError}</AlertDescription>
                </Alert>
              )}
              <label className="flex flex-col gap-1 text-sm">
                Note
                <textarea
                  aria-label="Product note"
                  className="min-h-24 rounded border bg-background px-2 py-1"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What should product take from this report?"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Linked area slug (optional)
                <Input
                  aria-label="Linked area"
                  placeholder="e.g. runfusion"
                  value={linkedArea}
                  onChange={(e) => setLinkedArea(e.target.value)}
                />
              </label>
              <div>
                <Button type="submit" className="min-h-[44px]" disabled={promoting || !note.trim()}>
                  {promoting ? "Promoting…" : "Promote to product"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
