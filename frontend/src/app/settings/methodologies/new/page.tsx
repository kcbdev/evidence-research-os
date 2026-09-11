"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveMethodology } from "@/lib/api";
import { previewStages } from "@/lib/methodology-preview";

export const TEMPLATE = `id: my-methodology-v1
name: "My Methodology"
description: "Describe what this pipeline does"
is_default: false
compatible_modes: [research]
workflow:
  stages:
    - {id: trigger_classifier, node: trigger_classifier, route: route_classifier}
    - {id: plan, node: plan}
    - {id: independent_first_pass, node: independent_first_pass, roles: [scientist, investigator, skeptic]}
    - {id: evidence_extraction, node: evidence_extraction}
    - {id: conflict_detection, node: conflict_detection, route: route_conflict}
    - {id: targeted_research, node: targeted_research}
    - {id: adversarial_review, node: adversarial_review}
    - {id: evidence_adjudication, node: evidence_adjudication}
    - {id: synthesis, node: synthesis}
    - {id: citation_audit, node: citation_audit, route: route_audit}
    - {id: targeted_repair, node: targeted_repair}
    - {id: human_checkpoint, node: human_checkpoint, interrupt: true}
    - {id: final_output, node: final_output}
tools:
  enabled: [search_web, fetch_url, fetch_pdf, grep_project, keyword_search, semantic_search, citation_verify, store_source, retrieve_evidence]
prompts:
  set: role-prompts/v1
  overrides: {}
skills:
  scientist: [hypothesis-decomposition]
  investigator: [source-retrieval, contradiction-search]
  skeptic: [adversarial-review-research]
  judge: [evidence-adjudication]
models:
  scientist: ""
  investigator: ""
  skeptic: ""
  judge: ""
  ideator: ""
  auditor: ""
budget_defaults:
  max_model_calls: 50
  max_research_rounds: 5
`;

export default function NewMethodologyPage() {
  const router = useRouter();
  const [yamlText, setYamlText] = useState(TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await saveMethodology(null, yamlText);
      router.push(`/settings/methodologies/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setSaving(false);
    }
  }

  const preview = previewStages(yamlText);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href="/settings/methodologies" className="text-sm underline">
          ← Methodologies
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New Methodology</h1>
        <p className="text-sm text-muted-foreground">
          Starts from a minimal valid research pipeline — edit, save, validation runs server-side.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Save failed</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <form onSubmit={(e) => void onCreate(e)} className="flex-1 flex flex-col gap-3">
          <label htmlFor="methodology-yaml" className="text-sm font-medium">
            Methodology YAML
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
              {saving ? "Saving…" : "Create methodology"}
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
    </div>
  );
}
