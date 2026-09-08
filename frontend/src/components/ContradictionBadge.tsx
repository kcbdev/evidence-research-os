"use client";

/**
 * Opposition indicator. Rendered as a span, NOT a link: no task surface
 * exists in MVP to deep-link to (no /tasks route, no task view), so a
 * href would be a dead promise. The count comes from the claims view's
 * opposition column (link-grounded counter-evidence). Revisit when a
 * task surface lands.
 */
export default function ContradictionBadge({
  opposition,
}: {
  opposition: number;
}) {
  if (opposition <= 0) return null;
  return (
    <span
      title={`${opposition} opposing source(s) — see evidence trace`}
      className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200"
    >
      <span aria-hidden="true">⚠ </span>
      {`${opposition} opposing`}
    </span>
  );
}
