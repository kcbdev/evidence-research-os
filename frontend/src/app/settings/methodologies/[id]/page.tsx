"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMethodology, saveMethodology } from "@/lib/api";
import { previewStages } from "@/lib/methodology-preview";

export default function MethodologyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [yamlText, setYamlText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const m = await getMethodology(id);
      const { default: yaml } = await import("yaml");
      setYamlText(yaml.stringify(m));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (yamlText === null) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveMethodology(id, yamlText);
      setSaved(true);
      await refresh(); // reload canonical saved form
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  const preview = previewStages(yamlText ?? "");

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href="/settings/methodologies" className="text-sm underline">
          ← Methodologies
        </Link>
        <h1 className="mt-2 text-2xl font-semibold font-mono">{id}</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert>
          <AlertTitle>Saved.</AlertTitle>
        </Alert>
      )}

      {yamlText === null && !error ? (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-10" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        yamlText !== null && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <form onSubmit={(e) => void onSave(e)} className="flex-1 flex flex-col gap-3">
              <label htmlFor="methodology-yaml" className="text-sm font-medium">
                Methodology YAML (validate-on-save, server-side)
              </label>
              <textarea
                id="methodology-yaml"
                aria-label="Methodology YAML"
                className="min-h-[50vh] rounded border bg-background px-2 py-1 font-mono text-sm"
                value={yamlText}
                onChange={(e) => setYamlText(e.target.value)}
                spellCheck={false}
              />
              <div>
                <Button type="submit" className="min-h-[44px]" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>

            <Card className="lg:w-80">
              <CardHeader>
                <CardTitle className="text-sm">Stage preview (approximate)</CardTitle>
              </CardHeader>
              <CardContent>
                {preview.stages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No stages detected.</p>
                ) : (
                  <ol className="flex flex-col gap-1 text-sm">
                    {preview.stages.map((s, i) => (
                      <li key={`${s.id}|${i}`}>
                        <span className="font-mono">{i + 1}. {s.id}</span>
                        <span className="text-muted-foreground"> · {s.node ?? "?"}</span>
                        {s.via && <span className="text-muted-foreground"> · {s.via}</span>}
                        {s.interrupt && <span> ⏸</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        )
      )}
    </div>
  );
}
