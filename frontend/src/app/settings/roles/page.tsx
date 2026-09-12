"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ModelSelector from "@/components/ModelSelector";
import {
  createRole,
  getMethodology,
  listMethodologies,
  listPrompts,
  listRoles,
  listSkills,
  listTools,
  savePrompt,
  updateRole,
  type LibraryRoleEntry,
  type MethodologySummary,
  type PromptEntry,
  type SkillEntry,
  type ToolRow,
} from "@/lib/api";

const roleSchema = z.object({
  id: z.string().min(1, "ID is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  system_prompt: z.string().min(1, "System prompt is required"),
});

type RoleForm = z.infer<typeof roleSchema>;

function fieldError(message?: string) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

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
  const [saving, setSaving] = useState(false);

  // Editor-local state (multi-selects + prompt sourcing live outside RHF;
  // zod validates the assembled object on submit).
  const [promptMode, setPromptMode] = useState<"library" | "inline">("inline");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promote, setPromote] = useState(false);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [outputSchema, setOutputSchema] = useState("");

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
            return { id: m.id, name: m.name, customRoleIds: [] };
          }
        }),
      );
      setMethodologies(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError: setFieldError,
    formState: { errors },
  } = useForm<RoleForm>({
    defaultValues: { id: "", name: "", description: "", system_prompt: "" },
  });

  useEffect(() => {
    if (editing === null) return;
    if (editing === "new") {
      reset({ id: "", name: "", description: "", system_prompt: "" });
      setPromptMode("inline");
      setSelectedPromptId("");
      setPromote(false);
      setToolNames([]);
      setSkillIds([]);
      setModel("");
      setOutputSchema("");
    } else {
      reset({
        id: editing.id,
        name: editing.name,
        description: editing.description,
        system_prompt: editing.system_prompt,
      });
      const inLibrary =
        editing.prompt_ref !== null &&
        prompts.some((p) => p.id === editing.prompt_ref);
      setPromptMode(inLibrary ? "library" : "inline");
      setSelectedPromptId(inLibrary ? (editing.prompt_ref as string) : "");
      setPromote(false);
      setToolNames(editing.tools);
      setSkillIds(editing.skills);
      setModel(editing.model);
      setOutputSchema(editing.output_schema ?? "");
    }
  }, [editing, reset, prompts]);

  const isNew = editing === "new";

  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function pickPrompt(id: string | null) {
    if (id === null) return;
    setSelectedPromptId(id);
    const found = prompts.find((p) => p.id === id);
    if (found) setValue("system_prompt", found.text);
  }

  async function onSubmit(data: RoleForm) {
    const parsed = roleSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "id" || field === "name" || field === "description" || field === "system_prompt") {
          setFieldError(field, { message: issue.message });
        }
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const roleId = isNew ? parsed.data.id : (editing as LibraryRoleEntry).id;
      let promptRef: string | null =
        isNew ? null : ((editing as LibraryRoleEntry).prompt_ref ?? null);
      if (promptMode === "library" && selectedPromptId) {
        promptRef = selectedPromptId;
      }
      if (promptMode === "inline" && promote && parsed.data.system_prompt.trim()) {
        const saved = await savePrompt({
          id: `${roleId}-prompt`,
          name: `${parsed.data.name} prompt`,
          description: `Promoted from role ${roleId}.`,
          text: parsed.data.system_prompt,
          version: 1,
          updated_at: "",
          history: [],
        });
        promptRef = saved.id;
      }
      const payload = {
        id: roleId,
        name: parsed.data.name,
        description: parsed.data.description,
        system_prompt: parsed.data.system_prompt,
        prompt_ref: promptRef,
        tools: toolNames,
        model,
        output_schema: outputSchema || null,
        skills: skillIds,
      };
      if (isNew) {
        await createRole(payload);
      } else {
        await updateRole(roleId, payload);
      }
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  function referencing(id: string): string[] {
    return methodologies
      .filter((m) => m.customRoleIds.includes(id))
      .map((m) => m.name);
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
                      <Badge key={m} variant="secondary">
                        {m}
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
                    <Button
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => setEditing(r)}
                    >
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Role" : "Edit Role"}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1">
              Editing affects all methodologies using this role.
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" className="text-sm underline">
                      Why?
                    </button>
                  }
                />
                <TooltipContent>
                  Roles are referenced, not copied — a save here changes
                  every methodology that names this role.
                </TooltipContent>
              </Tooltip>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="role-id" className="text-sm font-medium">
                ID
              </label>
              <Input
                id="role-id"
                className="font-mono min-h-[44px]"
                disabled={!isNew}
                {...register("id")}
              />
              {fieldError(errors.id?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="role-name" className="text-sm font-medium">
                Name
              </label>
              <Input id="role-name" className="min-h-[44px]" {...register("name")} />
              {fieldError(errors.name?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="role-description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="role-description"
                className="min-h-[44px]"
                {...register("description")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="prompt-mode" className="text-sm font-medium">
                System prompt source
              </label>
              <Select
                value={promptMode}
                onValueChange={(v) => {
                  if (v === "library" || v === "inline") setPromptMode(v);
                }}
              >
                <SelectTrigger id="prompt-mode" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="library">Prompts library entry</SelectItem>
                  <SelectItem value="inline">Write inline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {promptMode === "library" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="prompt-pick" className="text-sm font-medium">
                  Prompt
                </label>
                <Select value={selectedPromptId} onValueChange={pickPrompt}>
                  <SelectTrigger id="prompt-pick" className="min-h-[44px]">
                    <SelectValue placeholder="Pick a prompt" />
                  </SelectTrigger>
                  <SelectContent>
                    {prompts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="role-system-prompt" className="text-sm font-medium">
                System prompt
              </label>
              <Textarea
                id="role-system-prompt"
                rows={8}
                className="font-mono"
                {...register("system_prompt")}
              />
              {fieldError(errors.system_prompt?.message)}
            </div>
            {promptMode === "inline" && (
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={promote}
                  onCheckedChange={(v) => setPromote(v === true)}
                />
                Save as reusable prompt (promotes this text to the Prompts
                library on save)
              </label>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Tools (restrict for this role)</span>
              <p className="text-xs text-muted-foreground">
                All tools come from the backend registry — roles narrow the
                set, never widen it.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {tools.map((t) => (
                  <label
                    key={t.name}
                    className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded border px-2 text-sm"
                  >
                    <Checkbox
                      checked={toolNames.includes(t.name)}
                      onCheckedChange={() => toggle(toolNames, t.name, setToolNames)}
                    />
                    <span className="font-mono">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span id="role-model-label" className="text-sm font-medium">
                Model
              </span>
              <ModelSelector
                label="Role model"
                value={model}
                onChange={setModel}
              />
              <p className="text-xs text-muted-foreground">
                Empty means inherit from Settings → Models.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="output-schema" className="text-sm font-medium">
                Output schema
              </label>
              <Select
                value={outputSchema || "__freeform__"}
                onValueChange={(v) =>
                  setOutputSchema(v === "__freeform__" ? "" : (v ?? ""))
                }
              >
                <SelectTrigger id="output-schema" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__freeform__">Freeform</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                No structured output types are registered yet — freeform for now.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Skills</span>
              {skills.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No skills in the library yet.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {skills.map((s) => (
                    <label
                      key={s.id}
                      className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded border px-2 text-sm"
                    >
                      <Checkbox
                        checked={skillIds.includes(s.id)}
                        onCheckedChange={() => toggle(skillIds, s.id, setSkillIds)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" className="min-h-[44px]" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
