"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { approveRun, getLabProject, getReport, listClaims } from "@/lib/api";

export default function ApprovalModal({
  projectId,
  runId,
  onResolved,
}: {
  projectId: string;
  runId: string;
  onResolved: (decision: "approve" | "reject" | "edit") => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<{
    rows: { status: string }[];
    evidence: number | null;
    sources: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      listClaims(projectId),
      getLabProject(projectId),
    ]).then(([claimsRes, projectRes]) => {
      if (cancelled) return;
      // Advisory only: partial data still renders, buttons never block.
      setDossier({
        rows: claimsRes.status === "fulfilled" ? claimsRes.value : [],
        evidence:
          projectRes.status === "fulfilled"
            ? projectRes.value.counts.evidence
            : null,
        sources:
          projectRes.status === "fulfilled"
            ? projectRes.value.counts.sources
            : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function decide(decision: "approve" | "reject" | "edit") {
    if (busy) return; // re-entrancy: two clicks in one tick, one POST
    if (decision === "edit" && (draft === null || !draft.trim())) {
      setError("Edited draft is empty — nothing to continue with.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await approveRun(projectId, runId, decision, note,
        decision === "edit" ? (draft ?? "") : undefined);
      onResolved(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "approval failed");
      setBusy(false);
    }
  }

  async function openEditor() {
    setDraftError(null);
    try {
      const res = await getReport(projectId);
      setDraft(res.markdown);
      setEditing(true);
    } catch {
      setDraftError("No synthesis draft to edit yet.");
    }
  }

  const counts =
    dossier === null
      ? null
      : dossier.rows.reduce<Record<string, number>>((acc, row) => {
          acc[row.status] = (acc[row.status] ?? 0) + 1;
          return acc;
        }, {});

  return (
    // No dismiss path by design: the checkpoint resolves only via
    // Approve/Reject (parent unmounts on resolve), so onOpenChange is
    // intentionally a no-op rather than a close handler.
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        aria-label="Human checkpoint approval"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Human checkpoint approval</DialogTitle>
          <DialogDescription>
            <strong>Approve</strong> publishes <code>report.md</code> built
            from exactly the adjudicated claims below.{" "}
            <strong>Edit draft</strong> replaces the pending draft in place
            (re-running synthesis would discard edits).{" "}
            <strong>Reject</strong> stops the run — nothing is published.
          </DialogDescription>
        </DialogHeader>
        {counts === null ? (
          <p className="text-sm text-muted-foreground">Loading claims…</p>
        ) : (
          <dl className="text-sm">
            <div className="flex justify-between">
              <dt>Total claims</dt>
              <dd className="tabular-nums">{dossier?.rows.length ?? 0}</dd>
            </div>
            {dossier !== null &&
              dossier.evidence !== null &&
              dossier.sources !== null && (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Evidence · Sources</dt>
                  <dd className="tabular-nums">
                    {dossier.evidence} · {dossier.sources}
                  </dd>
                </div>
              )}
            {Object.entries(counts).map(([status, n]) => (
              <div key={status} className="flex justify-between">
                <dt>{status}</dt>
                <dd className="tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
        )}
        <a
          href={`/lab/${projectId}/claims`}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline"
        >
          Inspect the claims table →
        </a>
        <form
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="approval-note">Approval note</FieldLabel>
              <Input
                id="approval-note"
                aria-label="Approval note"
                placeholder="Note (optional)"
                className="min-h-[44px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </FieldGroup>
        </form>
        {editing && (
          <div className="flex flex-col gap-1">
            <label htmlFor="approval-draft" className="text-sm font-medium">
              Synthesis draft (edits ship on continue)
            </label>
            <textarea
              id="approval-draft"
              aria-label="Synthesis draft"
              className="min-h-48 rounded border bg-background px-2 py-1 font-mono text-sm"
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
        )}
        {draftError && <p className="text-sm text-destructive">{draftError}</p>}
        <DialogFooter>
          {!editing ? (
            <>
              <Button
                disabled={busy}
                type="button"
                className="min-h-[44px]"
                onClick={() => void decide("approve")}
              >
                Approve
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => void openEditor()}
              >
                Edit draft…
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => void decide("reject")}
              >
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={busy}
                type="button"
                className="min-h-[44px]"
                onClick={() => void decide("edit")}
              >
                {busy ? "Continuing…" : "Save & continue"}
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setEditing(false)}
              >
                Back
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
