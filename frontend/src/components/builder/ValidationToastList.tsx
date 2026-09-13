"use client";

export interface ServerVerdict {
  ok: boolean;
  detail: string | null;
}

interface ValidationToastListProps {
  /** Null until the first Validate run. */
  errors: string[] | null;
  warnings: string[];
  /** Server verdict on the STORED document (never the unsaved canvas). */
  server: ServerVerdict | null;
}

/**
 * Persistent validation readout (PBI-070). Sonner toasts announce the
 * Validate summary transiently; this list stays: red errors block
 * Save, amber warnings never do, and the server section always names
 * what it judged (the saved document, not the canvas).
 */
export default function ValidationToastList({
  errors,
  warnings,
  server,
}: ValidationToastListProps) {
  if (errors === null && warnings.length === 0 && server === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Not validated yet — run Validate to enable Save.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1" role="list" aria-label="Validation results">
      {errors !== null && errors.length === 0 && warnings.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Validation passed — canvas checks clean.
        </p>
      )}
      {(errors ?? []).map((e) => (
        <p key={e} role="listitem" className="text-xs text-destructive">
          {e}
        </p>
      ))}
      {warnings.map((w) => (
        <p
          key={w}
          role="listitem"
          className="text-xs text-amber-600 dark:text-amber-400"
        >
          {w}
        </p>
      ))}
      {server !== null && (
        <p className="text-xs text-muted-foreground">
          Server (saved document):{" "}
          {server.ok ? "valid" : `invalid — ${server.detail ?? "see error"}`}
        </p>
      )}
    </div>
  );
}
