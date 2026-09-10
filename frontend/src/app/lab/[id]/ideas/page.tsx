"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getIdeas, patchIdea, type Idea } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const COLUMNS = [
  { key: "proposed", title: "Proposed" },
  { key: "under_skeptic_review", title: "Under Skeptic Review" },
  { key: "promoted_to_claim", title: "Promoted to Claim" },
  { key: "rejected", title: "Rejected" },
];

function truncate(text: string, len: number) {
  return text.length > len ? text.slice(0, len) + "..." : text;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    proposed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    under_skeptic_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    promoted_to_claim: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <Badge variant="secondary" className={colors[status] || "bg-gray-100 text-gray-800"}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export default function IdeasPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    loadIdeas();
  }, [projectId]);

  async function loadIdeas() {
    const res = await getIdeas(projectId);
    setIdeas(res);
  }

  async function handlePromote(idea: Idea) {
    setPromoting(true);
    try {
      const res = await patchIdea(projectId, idea.id, { status: "promoted_to_claim" });
      if (res.created_claim_id) {
        router.push(`/lab/${projectId}/claims/${res.created_claim_id}`);
      } else {
        loadIdeas();
      }
    } catch (e) {
      console.error("Promote failed:", e);
    } finally {
      setPromoting(false);
    }
  }

  async function handleReject(idea: Idea) {
    try {
      await patchIdea(projectId, idea.id, { status: "rejected" });
      loadIdeas();
    } catch (e) {
      console.error("Reject failed:", e);
    }
  }

  function getIdeasByStatus(status: string) {
    return ideas.filter((i) => i.status === status);
  }

  if (ideas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-muted-foreground">
        <h2 className="text-xl font-medium">No ideas yet</h2>
        <p>Run a Brainstorm session to generate ideas.</p>
        <Button onClick={() => router.push(`/lab/${projectId}`)}>Back to Overview</Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4 p-4 overflow-hidden">
      {COLUMNS.map((col) => (
        <div key={col.key} className="flex-1 flex flex-col bg-card border rounded-lg overflow-hidden">
          <CardHeader className="p-3 border-b">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {col.title}
              <Badge variant="secondary" className="text-xs">
                {getIdeasByStatus(col.key).length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <div className="flex-1 p-2 overflow-y-auto">
            <div className="space-y-2 min-h-[200px]">
              {getIdeasByStatus(col.key).map((idea) => (
                <Card key={idea.id} className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setSelectedIdea(idea); setDetailOpen(true); }}>
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
                  Drop ideas here (via brainstorm run)
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-lg">{selectedIdea?.statement || "Idea Detail"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedIdea?.status || "proposed"} />
              <span className="text-sm text-muted-foreground">ID: {selectedIdea?.id}</span>
            </div>
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
                <Button onClick={() => handlePromote(selectedIdea!)} disabled={promoting}>
                  {promoting ? "Promoting..." : "Promote to Claim"}
                </Button>
              )}
              {(selectedIdea?.status === "proposed" || selectedIdea?.status === "under_skeptic_review") && (
                <Button variant="destructive" onClick={() => { handleReject(selectedIdea!); setDetailOpen(false); }}>
                  Reject
                </Button>
              )}
              <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}