"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  getPrompt,
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

// Full client mirror of backend LibraryRole (PBI-063): the five fields
// living in editor-local state are validated as part of the assembled
// object on submit, not just the four RHF-bound text fields.
const fullRoleSchema = roleSchema.extend({
  prompt_ref: z.string().nullable(),
  tools: z.array(z.string()),
  model: z.string(),
  output_schema: z.string().nullable(),
  skills: z.array(z.string()),
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
  const [pickedText, setPickedText] = useState<string | null>(null);
  const [promote, setPromote] = useState(false);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [outputSchema, setOutputSchema] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError: setFieldError,
    formState: { errors },
  } = useForm<RoleForm>({
    defaultValues: { id: "", name: "", description: "", system_prompt: "" },
  });

  // The init effect resets editor state when a different entry opens.
  // Guarded by identity (not by `prompts`): a mid-edit list refresh
  // must never wipe draft tool/skill checks.
  const editingKey = editing === null ? null : editing === "new" ? "new" : editing.id;
  const prevEditingKey = useRef<string | null>(null);
  useEffect(() => {
    if (editing === null) {
      prevEditingKey.current = null; // allow the same entry to reopen fresh
      return;
    }
    if (prevEditingKey.current === editingKey) return;
    prevEditingKey.current = editingKey;
    if (editing === "new") {
      reset({ id: "", name: "", description: "", system_prompt: "" });
      setPromptMode("inline");
      setSelectedPromptId("");
      setPickedText(null);
      setPromote(false);
      setToolNames([]);
      setSkillIds([]);
      setModel("");
      setOutputSchema("");
      setNotice(null);
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
      setPickedText(inLibrary ? editing.system_prompt : null);
      setPromote(false);
      setToolNames(editing.tools);
      setSkillIds(editing.skills);
      setModel(editing.model);
      setOutputSchema(editing.output_schema ?? "");
      setNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingKey]);

  const isNew = editing === "new";

  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function pickPrompt(id: string | null) {
    if (id === null) return;
    setSelectedPromptId(id);
    const found = prompts.find((p) => p.id === id);
    if (found) {
      setValue("system_prompt", found.text);
      setPickedText(found.text);
    }
  }

  // Library picks copy text once: a later manual edit diverges from the
  // library entry, so the provenance link must not claim otherwise.
  const liveSystemPrompt = watch("system_prompt");
  const diverged =
    promptMode === "library" &&
    selectedPromptId !== "" &&
    pickedText !== null &&
    liveSystemPrompt !== pickedText;

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
    setNotice(null);
    try {
      const roleId = isNew ? parsed.data.id : (editing as LibraryRoleEntry).id;
      let promptRef: string | null =
        isNew ? null : ((editing as LibraryRoleEntry).prompt_ref ?? null);
      if (promptMode === "library" && selectedPromptId) {
        // Diverged manual edits must not file false provenance.
        promptRef = diverged ? null : selectedPromptId;
      }
      let promptCreated: string | null = null;
      if (promptMode === "inline" && promote && parsed.data.system_prompt.trim()) {
        const promptId = `${roleId}-prompt`;
        try {
          await getPrompt(promptId);
          // Already exists: link it, never clobber its text/history.
          promptRef = promptId;
          setNotice(
            `Linked existing prompt ${promptId} — edit its text in the Prompts library.`,
          );
        } catch {
          const saved = await savePrompt({
            id: promptId,
            name: `${parsed.data.name} prompt`,
            description: `Promoted from role ${roleId}.`,
            text: parsed.data.system_prompt,
          });
          promptRef = saved.id;
          promptCreated = saved.id;
        }
      }
      const assembled = {
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
      const full = fullRoleSchema.safeParse(assembled);
      if (!full.success) {
        setError(`Role failed validation: ${full.error.issues[0]?.message ?? "unknown"}`);
        return;
      }
      try {
        if (isNew) {
          await createRole(full.data);
        } else {
          await updateRole(roleId, full.data);
        }
      } catch (err) {
        // The prompt half may already be saved — say so explicitly,
        // never leave a half-state silent.
        const reason = err instanceof Error ? err.message : "save failed";
        setError(
          promptCreated !== null
            ? `Prompt ${promptCreated} was created, but the role was NOT saved: ${reason}`
            : reason,
        );
        return;
      }
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

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

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Role" : "Edit Role"}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1">
              Editing affects all methodologies using this role.
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="min-h-[44px] min-w-[44px] px-2 text-sm underline"
                    >
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
              <span id="prompt-mode-label" className="text-sm font-medium">
                System prompt source
              </span>
              <Select
                value={promptMode}
                onValueChange={(v) => {
                  if (v === "library" || v === "inline") setPromptMode(v);
                }}
              >
                <SelectTrigger
                  id="prompt-mode"
                  aria-labelledby="prompt-mode-label"
                  className="min-h-[44px]"
                >
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
                <span id="prompt-pick-label" className="text-sm font-medium">
                  Prompt
                </span>
                <Select value={selectedPromptId} onValueChange={pickPrompt}>
                  <SelectTrigger
                    id="prompt-pick"
                    aria-labelledby="prompt-pick-label"
                    className="min-h-[44px]"
                  >
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
                className="font-mono min-h-[44px]"
                {...register("system_prompt")}
              />
              {diverged && (
                <p className="text-xs text-muted-foreground">
                  Edited — no longer linked to the library prompt and will
                  save unlinked.
                </p>
              )}
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
              <span aria-hidden="true" className="text-sm font-medium">
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
              <span id="output-schema-label" className="text-sm font-medium">
                Output schema
              </span>
              <Select
                value={outputSchema || "__freeform__"}
                onValueChange={(v) =>
                  setOutputSchema(v === "__freeform__" ? "" : (v ?? ""))
                }
              >
                <SelectTrigger
                  id="output-schema"
                  aria-labelledby="output-schema-label"
                  className="min-h-[44px]"
                >
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
          {notice && (
            <Alert>
              <AlertTitle>Note</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
