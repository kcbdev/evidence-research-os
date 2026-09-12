"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import RoleEditorDialog from "@/components/builder/RoleEditorDialog";
import {
  getMethodology,
  listMethodologies,
  listPrompts,
  listRoles,
  listSkills,
  listTools,
  type LibraryRoleEntry,
  type MethodologySummary,
  type PromptEntry,
  type SkillEntry,
  type ToolRow,
} from "@/lib/api";

interface MethodologyRefs {
  id: string;
  name: string;
  customRoleIds: string[];
}

export default function RolesPage() {
  const [roles, setRoles] = useState<LibraryRoleEntry[] | null>(null);
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [methodologies, setMethodologies] = useState<MethodologyRefs[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LibraryRoleEntry | "new" | null>(null);
  const [refsWarning, setRefsWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [ro, pr, sk, to, ms] = await Promise.all([
        listRoles(),
        listPrompts(),
        listSkills(),
        listTools(),
        listMethodologies(),
      ]);
      setRoles(ro);
      setPrompts(pr);
      setSkills(sk);
      setTools(to);
      let failedRefs = 0;
      const details = await Promise.all(
        ms.map(async (m: MethodologySummary) => {
          try {
            const full = await getMethodology(m.id);
            return {
              id: full.id,
              name: full.name,
              customRoleIds: (full.custom_roles ?? []).map((c) => c.id),
            };
          } catch {
            failedRefs += 1;
            return { id: m.id, name: m.name, customRoleIds: [] };
          }
        }),
      );
      setMethodologies(details);
      setRefsWarning(
        failedRefs > 0
          ? `${failedRefs} methodolog${failedRefs === 1 ? "y" : "ies"} failed to load — reference badges may be incomplete.`
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function referencing(id: string): { id: string; name: string }[] {
    return methodologies
      .filter((m) => m.customRoleIds.includes(id))
      .map((m) => ({ id: m.id, name: m.name }));
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings/methodologies" className="text-sm underline">
            ← Methodologies
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Custom Roles</h1>
          <p className="text-sm text-muted-foreground">
            Agent roles authored once, referenced from many methodologies.
          </p>
        </div>
        <Button className="min-h-[44px]" onClick={() => setEditing("new")}>
          New Role
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {refsWarning && (
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>{refsWarning}</AlertDescription>
        </Alert>
      )}
      {roles === null && !error && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {roles !== null && roles.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No custom roles</EmptyTitle>
            <EmptyDescription>Create one to start.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {roles !== null && roles.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((r) => {
            const refs = referencing(r.id);
            return (
              <Card key={r.id}>
                <CardHeader>
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    {r.name}
                    {refs.map((m) => (
                      <Badge key={m.id} variant="secondary">
                        {m.name}
                      </Badge>
                    ))}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">{r.description}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {r.id} · model: {r.model || "inherits"} · tools:{" "}
                    {r.tools.length} · skills: {r.skills.length}
                  </p>
                  <div>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="outline"
                            className="min-h-[44px]"
                            onClick={() => setEditing(r)}
                          >
                            Edit
                          </Button>
                        }
                      />
                      <TooltipContent>
                        Editing affects all methodologies using this role.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RoleEditorDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initial={editing ?? "new"}
        prompts={prompts}
        skills={skills}
        tools={tools}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
      />
    </div>
  );
}
