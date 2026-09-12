"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import MDEditor from "@uiw/react-md-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  listRoles,
  listSkills,
  createSkill,
  updateSkill,
  type LibraryRoleEntry,
  type SkillEntry,
} from "@/lib/api";

const skillSchema = z.object({
  id: z.string().min(1, "ID is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  body: z.string().min(1, "Body is required"),
});

type SkillForm = z.infer<typeof skillSchema>;

function fieldError(message?: string) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillEntry[] | null>(null);
  const [roles, setRoles] = useState<LibraryRoleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SkillEntry | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);

  useEffect(() => {
    setEditorMounted(true); // MDEditor needs DOM — never SSR-prerender it
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [s, r] = await Promise.all([listSkills(), listRoles()]);
      setSkills(s);
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
    control,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<SkillForm>({
    defaultValues: { id: "", name: "", description: "", body: "" },
  });

  useEffect(() => {
    if (editing === null) return;
    reset(
      editing === "new"
        ? { id: "", name: "", description: "", body: "" }
        : {
            id: editing.id,
            name: editing.name,
            description: editing.description,
            body: editing.body,
          },
    );
  }, [editing, reset]);

  const isNew = editing === "new";

  async function onSubmit(data: SkillForm) {
    const parsed = skillSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "id" || field === "name" || field === "description" || field === "body") {
          setFieldError(field, { message: issue.message });
        }
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await createSkill({ ...parsed.data });
      } else if (editing !== null) {
        await updateSkill(editing.id, { ...parsed.data, id: editing.id });
      }
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  function usedBy(id: string): string[] {
    return roles.filter((r) => r.skills.includes(id)).map((r) => r.name);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/settings/methodologies" className="text-sm underline">
            ← Methodologies
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Skills</h1>
          <p className="text-sm text-muted-foreground">
            Reusable markdown procedures. Roles reference them — assignment
            happens in the Role editor, this side is read-only.
          </p>
        </div>
        <Button className="min-h-[44px]" onClick={() => setEditing("new")}>
          New Skill
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {skills === null && !error && (
        <div className="flex flex-col gap-2" aria-label="Loading">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {skills !== null && skills.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No skills</EmptyTitle>
            <EmptyDescription>Create one to start.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {skills !== null && skills.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {skills.map((s) => {
            const users = usedBy(s.id);
            return (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  <p className="text-xs text-muted-foreground font-mono">{s.id}</p>
                  <p className="text-xs text-muted-foreground">
                    Used by: {users.length > 0 ? users.join(", ") : "no roles"}
                  </p>
                  <div>
                    <Button
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => setEditing(s)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNew ? "New Skill" : "Edit Skill"}</DialogTitle>
            <DialogDescription>
              The body is the literal Skill file content (markdown).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="skill-id" className="text-sm font-medium">
                ID
              </label>
              <Input
                id="skill-id"
                className="font-mono min-h-[44px]"
                disabled={!isNew}
                {...register("id")}
              />
              {fieldError(errors.id?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="skill-name" className="text-sm font-medium">
                Name
              </label>
              <Input id="skill-name" className="min-h-[44px]" {...register("name")} />
              {fieldError(errors.name?.message)}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="skill-description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="skill-description"
                className="min-h-[44px]"
                {...register("description")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span id="skill-body-label" className="text-sm font-medium">
                Body (markdown)
              </span>
              {editorMounted ? (
                <Controller
                  name="body"
                  control={control}
                  render={({ field }) => (
                    <div data-color-mode="dark">
                      <MDEditor
                        aria-labelledby="skill-body-label"
                        value={field.value}
                        height={300}
                        onChange={(v) => field.onChange(v ?? "")}
                      />
                    </div>
                  )}
                />
              ) : (
                <Skeleton className="h-[300px]" aria-label="Loading editor" />
              )}
              {fieldError(errors.body?.message)}
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
