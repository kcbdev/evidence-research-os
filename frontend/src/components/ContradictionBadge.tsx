"use client";

import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Opposition indicator as a BUTTON (PBI-021): opens the claim's trace
 * modal, whose Linked-tasks section is the task deep-link surface.
 * Rendered via Badge's `render` prop (base-ui polymorphism — no nested
 * interactive elements). Falls back to nothing without opposition.
 */
export default function ContradictionBadge({
  opposition,
  claimId,
  onOpen,
}: {
  opposition: number;
  claimId: string;
  onOpen: (claimId: string) => void;
}) {
  if (opposition <= 0) return null;
  return (
    <Badge
      variant="outline"
      title={`${opposition} opposing source(s) — open evidence trace`}
      render={<button onClick={() => onOpen(claimId)} />}
    >
      <TriangleAlert aria-hidden="true" />
      {`${opposition} opposing`}
    </Badge>
  );
}
