"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getReportStructure,
  listClaims,
  putReportStructure,
  type ClaimRow,
  type ReportSection,
} from "@/lib/api";

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Pre-synthesis structure editor (PBI-083, C11): an optional manual
 * step arranging which claims go in which report section and in what
 * order. Ordering/inclusion ONLY — claim statements render as
 * read-only text (no input is ever bound to a statement) and the
 * payload carries ids + titles alone, so content editing is
 * structurally impossible. Saved order persists as the
 * output/structure.yaml run artifact; the next synthesis honors it,
 * absence reproduces legacy behavior. */
export default function StructureEditor({ projectId }: { projectId: string }) {
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [sections, setSections] = useState<ReportSection[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setClaims(null);
    setSections(null);
    setError(null);
    void listClaims(projectId).then(
      (rows) => {
        if (!cancelled) setClaims(rows);
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "failed to load claims");
        }
      },
    );
    void getReportStructure(projectId).then(
      (res) => {
        if (!cancelled) setSections(res.sections ?? []);
      },
      (err: unknown) => {
        // Surfaced, not swallowed: a failing endpoint presenting as
        // "no structure" would invite a doomed save.
        if (!cancelled) {
          setSections([]);
          setLoadNotice(
            err instanceof Error
              ? `Saved order could not be loaded: ${err.message}`
              : "Saved order could not be loaded.",
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (claims === null || sections === null) {
    return (
      <p className="text-sm text-muted-foreground" aria-label="Loading structure editor">
        Loading structure editor…
      </p>
    );
  }

  const placed = new Set(sections.flatMap((s) => s.claim_ids));
  const unassigned = claims.filter((c) => !placed.has(c.id));
  const byId = new Map(claims.map((c) => [c.id, c]));

  function markDirty(next: ReportSection[]) {
    setSections(next);
    setSaved(false);
  }

  async function onSave() {
    if (sections === null) return;
    const current = sections;
    setSaving(true);
    setError(null);
    try {
      const res = await putReportStructure(projectId, current);
      setSections(res.sections ?? []);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onRevert() {
    // PUT [] clears the recorded order (committed delete) and
    // restores the legacy render — the one-way-door fix.
    setSaving(true);
    setError(null);
    try {
      const res = await putReportStructure(projectId, []);
      setSections(res.sections ?? []);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "revert failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Report structure</CardTitle>
        <p className="text-sm text-muted-foreground">
          Arrange which claims go in which section and in what order. The
          next synthesis honors this order; claims left unassigned render
          afterwards. Statements are never edited here.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Structure editor failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loadNotice && (
          <p role="status" className="text-sm text-muted-foreground">
            {loadNotice}
          </p>
        )}
        {sections.map((section, si) => (
          <section
            key={si}
            aria-label={`Section ${section.title}`}
            className="rounded-md border p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Section ${si + 1} title`}
                value={section.title}
                onChange={(e) => {
                  const next = [...sections];
                  next[si] = { ...section, title: e.target.value };
                  markDirty(next);
                }}
                className="max-w-64"
              />
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={si === 0}
                onClick={() => markDirty(move(sections, si, si - 1))}
                aria-label={`Move section ${section.title} up`}
              >
                ↑
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={si === sections.length - 1}
                onClick={() => markDirty(move(sections, si, si + 1))}
                aria-label={`Move section ${section.title} down`}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px]"
                onClick={() =>
                  markDirty(sections.filter((_, i) => i !== si))
                }
                aria-label={`Remove section ${section.title}`}
              >
                Remove
              </Button>
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {section.claim_ids.map((cid, ci) => {
                const claim = byId.get(cid);
                return (
                  <li
                    key={cid}
                    className="flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-sm"
                  >
                    <span className="font-mono">{cid}</span>
                    {claim && (
                      <span className="min-w-0 flex-1 text-muted-foreground">
                        {claim.statement}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ci === 0}
                      onClick={() => {
                        const next = [...sections];
                        next[si] = {
                          ...section,
                          claim_ids: move(section.claim_ids, ci, ci - 1),
                        };
                        markDirty(next);
                      }}
                      aria-label={`Move ${cid} up in ${section.title}`}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ci === section.claim_ids.length - 1}
                      onClick={() => {
                        const next = [...sections];
                        next[si] = {
                          ...section,
                          claim_ids: move(section.claim_ids, ci, ci + 1),
                        };
                        markDirty(next);
                      }}
                      aria-label={`Move ${cid} down in ${section.title}`}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = [...sections];
                        next[si] = {
                          ...section,
                          claim_ids: section.claim_ids.filter((id) => id !== cid),
                        };
                        markDirty(next);
                      }}
                      aria-label={`Unassign ${cid} from ${section.title}`}
                    >
                      Unassign
                    </Button>
                  </li>
                );
              })}
            </ul>
            {unassigned.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <Select
                  value=""
                  onValueChange={(cid) => {
                    if (!cid) return;
                    const next = [...sections];
                    next[si] = {
                      ...section,
                      claim_ids: [...section.claim_ids, cid],
                    };
                    markDirty(next);
                  }}
                >
                  <SelectTrigger
                    aria-label={`Assign claim to ${section.title}`}
                    className="max-w-64"
                  >
                    <SelectValue placeholder="Assign a claim…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unassigned.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>
        ))}
        {unassigned.length > 0 && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="unassigned-line"
          >
            Unassigned: {unassigned.map((c) => c.id).join(", ")} — render
            after the sections above.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="New section title"
            placeholder="New section title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="max-w-64"
          />
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={!newTitle.trim()}
            onClick={() => {
              markDirty([...sections, { title: newTitle.trim(), claim_ids: [] }]);
              setNewTitle("");
            }}
          >
            Add section
          </Button>
          <Button
            className="min-h-[44px]"
            disabled={saving || sections.length === 0}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save structure"}
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={saving || sections.length === 0}
            onClick={() => void onRevert()}
          >
            Revert to default order
          </Button>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              Saved.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
