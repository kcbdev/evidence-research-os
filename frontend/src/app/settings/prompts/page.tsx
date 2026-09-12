"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getPrompt,
  getPromptVersions,
  listPrompts,
  listRoles,
  savePrompt,
  updatePrompt,
  type LibraryRoleEntry,
  type PromptEntry,
  type PromptVersionRow,
} from "@/lib/api";

const promptSchema = z.object({
  id: z.string().min(1, "ID is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  text: z.string().min(1, "Prompt text is required"),
});

type PromptForm = z.infer<typeof promptSchema>;

function fieldError(message?: string) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptEntry[] | null>(null);
  const [roles, setRoles] = useState<LibraryRoleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PromptEntry | "new" | null>(null);
  const [versions, setVersions] = useState<PromptVersionRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [p, r] = await Promise.all([listPrompts(), listRoles()]);
      setPrompts(p);
      setRoles(r);
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
  } = useForm<PromptForm>({
    defaultValues: { id: "", name: "", description: "", text: "" },
  });

  // Identity-guarded init (same lesson as the Roles page): saving
  // produces a new entry object for the same id — re-running reset +
  // refetch on object identity would wipe in-flight drafts and double
  // the versions traffic. Save paths refresh explicitly instead.
  const editingKey = editing === null ? null : editing === "new" ? "new" : editing.id;
  const prevEditingKey = useRef<string | null>(null);
  useEffect(() => {
    if (editing === null) {
      prevEditingKey.current = null;
      return;
    }
    if (prevEditingKey.current === editingKey) return;
    prevEditingKey.current = editingKey;
    setVersions(null);
    setSaved(false);
    if (editing === "new") {
      reset({ id: "", name: "", description: "", text: "" });
    } else {
      reset({
        id: editing.id,
        name: editing.name,
        description: editing.description,
        text: editing.text,
      });
      void getPromptVersions(editing.id)
        .then(setVersions)
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "versions failed"),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingKey]);

  const isNew = editing === "new";

  async function persist(data: PromptForm, base: PromptEntry | null) {
    const parsed = promptSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "id" || field === "name" || field === "description" || field === "text") {
          setFieldError(field, { message: issue.message });
        }
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew || base === null) {
        // Backend POST is upsert and history stores text only — a
        // typo'd id would clobber another prompt's metadata beyond
        // recovery. Guard client-side; the save stays authoritative.
        try {
          await getPrompt(parsed.data.id);
          setFieldError("id", {
            message: "This ID already exists — edit it from the list instead.",
          });
          return;
        } catch {
          // Absent (or unreadable) — proceed; save errors surface below.
        }
        await savePrompt({ ...parsed.data });
        setEditing(null);
      } else {
        const savedEntry = await updatePrompt(base.id, {
          ...base,
          ...parsed.data,
          id: base.id,
        });
        setEditing(savedEntry);
        setVersions(await getPromptVersions(base.id));
        setSaved(true);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onRevert(entry: PromptEntry, row: PromptVersionRow) {
    setSaving(true);
    setError(null);
    try {
      const savedEntry = await updatePrompt(entry.id, {
        ...entry,
        text: row.text,
      });
      setValue("text", row.text);
      setEditing(savedEntry);
      setVersions(await getPromptVersions(entry.id));
      setSaved(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "revert failed");
    } finally {
      setSaving(false);
    }
  }

  function usedByCount(id: string): number {
    return roles.filter((r) => r.prompt_ref === id).length;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings/methodologies" className="text-sm underline">
            ← Methodologies
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Prompts</h1>
          <p className="text-sm text-muted-foreground">
            Versioned prompt texts. Every save mints a revertable version.
          </p>
        </div>
        <Button className="min-h-[44px]" onClick={() => setEditing("new")}>
          New Prompt
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {prompts === null && !error && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {prompts !== null && prompts.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No prompts</EmptyTitle>
            <EmptyDescription>Create one to start.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {prompts !== null && prompts.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Last edited</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.description}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.updated_at || "—"}
                  </TableCell>
                  <TableCell>
                    {usedByCount(p.id) === 0
                      ? "no roles"
                      : `${usedByCount(p.id)} role${usedByCount(p.id) === 1 ? "" : "s"}`}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => setEditing(p)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Prompt" : "Edit Prompt"}</DialogTitle>
            <DialogDescription>
              {isNew
                ? "Creates version 1."
                : "Saving mints a new version — every version below stays revertable."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) =>
              void handleSubmit((data) =>
                persist(data, isNew ? null : (editing as PromptEntry)),
              )(e)
            }
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="prompt-id" className="text-sm font-medium">
                ID
              </label>
              <Input
                id="prompt-id"
                className="font-mono min-h-[44px]"
                disabled={!isNew}
                {...register("id")}
              />
              {fieldError(errors.id?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="prompt-name" className="text-sm font-medium">
                Name
              </label>
              <Input id="prompt-name" className="min-h-[44px]" {...register("name")} />
              {fieldError(errors.name?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="prompt-description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="prompt-description"
                className="min-h-[44px]"
                {...register("description")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="prompt-text" className="text-sm font-medium">
                Prompt text
              </label>
              <Textarea
                id="prompt-text"
                rows={10}
                className="font-mono min-h-[44px]"
                {...register("text")}
              />
              {fieldError(errors.text?.message)}
            </div>
            {saved && (
              <Alert>
                <AlertTitle>Saved.</AlertTitle>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setEditing(null)}
              >
                {isNew ? "Cancel" : "Close"}
              </Button>
              <Button type="submit" className="min-h-[44px]" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
          {!isNew && editing !== null && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Version history</h2>
              {versions === null ? (
                <Skeleton className="h-10" aria-label="Loading versions" />
              ) : (
                <Accordion>
                  {versions.map((v) => (
                    <AccordionItem key={v.version} value={String(v.version)}>
                      <AccordionTrigger>
                        Version {v.version}
                        {v.version === (editing as PromptEntry).version
                          ? " (current)"
                          : ""}
                        {v.saved_at ? ` · ${v.saved_at}` : ""}
                      </AccordionTrigger>
                      <AccordionContent>
                        <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                          {v.text}
                        </pre>
                        {v.version !== (editing as PromptEntry).version && (
                          <Button
                            variant="outline"
                            className="mt-2 min-h-[44px]"
                            disabled={saving}
                            onClick={() => void onRevert(editing as PromptEntry, v)}
                          >
                            Revert to this version
                          </Button>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
