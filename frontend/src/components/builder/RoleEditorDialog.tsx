"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ModelSelector from "@/components/ModelSelector";
import {
  createRole,
  getPrompt,
  savePrompt,
  updateRole,
  type LibraryRoleEntry,
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

/**
 * Shared role editor (PBI-065 library page + PBI-067 canvas flows).
 * Save errors render inside the dialog (contextual for both callers);
 * the parent owns list refresh via onSaved.
 */
export default function RoleEditorDialog({
  open,
  onOpenChange,
  initial,
  prompts,
  skills,
  tools,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LibraryRoleEntry | "new";
  prompts: PromptEntry[];
  skills: SkillEntry[];
  tools: ToolRow[];
  onSaved: (entry: LibraryRoleEntry) => void;
}) {
  const [error, setError] = useState<string | null>(null);
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
  // Guarded by identity: a mid-edit list refresh must never wipe drafts.
  const initialKey = initial === "new" ? "new" : initial.id;
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      prevKey.current = null; // allow the same entry to reopen fresh
      return;
    }
    if (prevKey.current === initialKey) return;
    prevKey.current = initialKey;
    setError(null);
    if (initial === "new") {
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
        id: initial.id,
        name: initial.name,
        description: initial.description,
        system_prompt: initial.system_prompt,
      });
      const inLibrary =
        initial.prompt_ref !== null &&
        prompts.some((p) => p.id === initial.prompt_ref);
      setPromptMode(inLibrary ? "library" : "inline");
      setSelectedPromptId(inLibrary ? (initial.prompt_ref as string) : "");
      setPickedText(inLibrary ? initial.system_prompt : null);
      setPromote(false);
      setToolNames(initial.tools);
      setSkillIds(initial.skills);
      setModel(initial.model);
      setOutputSchema(initial.output_schema ?? "");
      setNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKey]);

  const isNew = initial === "new";

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
      const roleId = isNew ? parsed.data.id : (initial as LibraryRoleEntry).id;
      let promptRef: string | null =
        isNew ? null : ((initial as LibraryRoleEntry).prompt_ref ?? null);
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
        const savedEntry = isNew
          ? await createRole(full.data)
          : await updateRole(roleId, full.data);
        onSaved(savedEntry);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Role" : "Edit Role"}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1">
              Library roles are snapshotted into each methodology on
              placement — a save here updates the library, and canvases
              refresh entries without local overrides.
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
                  Placement copies the entry into the methodology; later
                  library edits refresh canvases unless a node carries
                  methodology-local overrides.
                </TooltipContent>
              </Tooltip>
            </DialogDescription>
          </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
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
              onClick={() => onOpenChange(false)}
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
  );
}
