"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getIdeas, patchIdea, startRun, type Idea } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = [
  { key: "proposed", title: "Proposed" },
  { key: "under_skeptic_review", title: "Under Skeptic Review" },
  { key: "promoted_to_claim", title: "Promoted to Claim" },
  { key: "rejected", title: "Rejected" },
];

function truncate(text: string, len: number) {
  return text.length > len ? text.slice(0, len) + "..." : text;
}

// NOTE (F8): idea statuses are a disjoint vocabulary from claim statuses
// (SUPPORTED/DISPUTED/...) so no trust-signal collision — this palette is
// intentionally separate, expressed with semantic badge variants only.
function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary">
      {status.split("_").join(" ")}
    </Badge>
  );
}

export default function IdeasPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promotedClaim, setPromotedClaim] = useState<string | null>(null);
  const [startingRun, setStartingRun] = useState(false);

  const loadIdeas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setIdeas(await getIdeas(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load ideas");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadIdeas();
  }, [loadIdeas]);

  function openDetail(idea: Idea) {
    setSelectedIdea(idea);
    setActionError(null);
    setPromotedClaim(null);
    setDetailOpen(true);
  }

  async function handlePromote(idea: Idea) {
    setPromoting(true);
    setActionError(null);
    try {
      const res = await patchIdea(projectId, idea.id, { status: "promoted_to_claim" });
      if (res.created_claim_id) {
        setPromotedClaim(res.created_claim_id);
      }
      await loadIdeas();
      setSelectedIdea((prev) =>
        prev && prev.id === idea.id ? { ...prev, status: "promoted_to_claim" } : prev,
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "promote failed");
    } finally {
      setPromoting(false);
    }
  }

  async function handleReject(idea: Idea) {
    setActionError(null);
    try {
      await patchIdea(projectId, idea.id, { status: "rejected" });
      setDetailOpen(false);
      await loadIdeas();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "reject failed");
    }
  }

  async function handleStartResearchRun() {
    setStartingRun(true);
    setActionError(null);
    try {
      const run = await startRun(projectId, { mode: "research" });
      router.push(`/lab/${projectId}/runs/${run.run_id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "start failed");
    } finally {
      setStartingRun(false);
    }
  }

  function getIdeasByStatus(status: string) {
    return ideas.filter((i) => i.status === status);
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Couldn’t load ideas</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="p-4">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No ideas yet</EmptyTitle>
            <EmptyDescription>
              Run a Brainstorm session — new ideas appear on this board.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => router.push(`/lab/${projectId}`)} className="min-h-[44px]">
            Back to Overview
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <Link href={`/lab/${projectId}`} className="text-sm underline">
          ← Lab overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Ideas</h1>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((col) => (
          <div key={col.key} className="min-w-64 flex-1 flex flex-col bg-card border rounded-lg overflow-hidden">
            <div className="p-3 border-b">
              <h3 className="text-sm font-medium flex items-center gap-2">
                {col.title}
                <Badge variant="secondary" className="text-xs">
                  {getIdeasByStatus(col.key).length}
                </Badge>
              </h3>
            </div>
            <div className="flex-1 p-2 overflow-y-auto">
              <div className="space-y-2 min-h-50">
                {getIdeasByStatus(col.key).map((idea) => (
                  <Card
                    key={idea.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open idea ${idea.id}`}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => openDetail(idea)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(idea);
                      }
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <StatusBadge status={idea.status} />
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">{truncate(idea.statement, 120)}</p>
                      {idea.novelty_check && (
                        <Badge variant="outline" className="text-xs mt-2">
                          Novelty: {idea.novelty_check.status}
                        </Badge>
                      )}
                      {idea.proposed_experiment && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                          Falsification: {truncate(idea.proposed_experiment.falsification_condition, 80)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {getIdeasByStatus(col.key).length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-8">
                    No ideas — they appear here after a brainstorm run.
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{selectedIdea?.statement || "Idea Detail"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedIdea?.status || "proposed"} />
              <span className="text-sm text-muted-foreground">ID: {selectedIdea?.id}</span>
            </div>
            {actionError && (
              <Alert variant="destructive">
                <AlertTitle>Action failed</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            {promotedClaim ? (
              <div className="space-y-3">
                <Alert>
                  <AlertTitle>Claim {promotedClaim} created</AlertTitle>
                  <AlertDescription>
                    Start a research run on it now, or continue browsing.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="min-h-[44px]"
                    disabled={startingRun}
                    onClick={handleStartResearchRun}
                  >
                    {startingRun ? "Starting…" : "Start research run"}
                  </Button>
                  <Button variant="outline" className="min-h-[44px]" onClick={() => router.push(`/lab/${projectId}/claims`)}>
                    View claims
                  </Button>
                  <Button variant="ghost" className="min-h-[44px]" onClick={() => setDetailOpen(false)}>
                    Stay here
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Separator />
                <div>
                  <span className="block text-sm font-medium mb-1">Statement</span>
                  <p className="text-sm whitespace-pre-wrap">{selectedIdea?.statement}</p>
                </div>
                {selectedIdea?.novelty_check && (
                  <div>
                    <span className="block text-sm font-medium mb-1">Novelty Check</span>
                    <div className="space-y-1 text-sm">
                      <div><span className="font-medium">Status:</span> {selectedIdea.novelty_check.status}</div>
                      <div><span className="font-medium">Against:</span> {selectedIdea.novelty_check.against.join(", ") || "none"}</div>
                    </div>
                  </div>
                )}
                {selectedIdea?.proposed_experiment && (
                  <div>
                    <span className="block text-sm font-medium mb-1">Proposed Experiment</span>
                    <div className="space-y-1 text-sm">
                      <div><span className="font-medium">Hypothesis:</span> {selectedIdea.proposed_experiment.hypothesis}</div>
                      <div><span className="font-medium">Falsification:</span> {selectedIdea.proposed_experiment.falsification_condition}</div>
                      <div><span className="font-medium">Feasibility:</span> {selectedIdea.proposed_experiment.feasibility}</div>
                    </div>
                  </div>
                )}
                <Separator />
                <DialogFooter>
                  {selectedIdea?.status === "under_skeptic_review" && (
                    <Button onClick={() => selectedIdea && handlePromote(selectedIdea)} disabled={promoting} className="min-h-[44px]">
                      {promoting ? "Promoting..." : "Promote to Claim"}
                    </Button>
                  )}
                  {(selectedIdea?.status === "proposed" || selectedIdea?.status === "under_skeptic_review") && (
                    <Button variant="destructive" className="min-h-[44px]" onClick={() => selectedIdea && handleReject(selectedIdea)}>
                      Reject
                    </Button>
                  )}
                  <Button variant="outline" className="min-h-[44px]" onClick={() => setDetailOpen(false)}>Close</Button>
                </DialogFooter>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
