"use client";

import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Opposition indicator. Rendered as a span-styled Badge, NOT a link:
 * no task surface exists in MVP to deep-link to (no /tasks route, no
 * task view), so an href would be a dead promise. The count comes from
 * the claims view's opposition column (link-grounded counter-evidence).
 * Revisit when a task surface lands (PBI-021).
 */
export default function ContradictionBadge({
  opposition,
}: {
  opposition: number;
}) {
  if (opposition <= 0) return null;
  return (
    <Badge variant="outline" title={`${opposition} opposing source(s)`}>
      <TriangleAlert aria-hidden="true" />
      {`${opposition} opposing`}
    </Badge>
  );
}
