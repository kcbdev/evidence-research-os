"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

// PBI-069: the raw-YAML editor is retired — the builder is the single
// edit surface. Auto-forward (plus a plain link fallback) so booked
// URLs keep working; raw-text editing returns as Export/Import in
// PBI-070. Client component (like every page here) so the forward is
// unit-testable in jsdom.
export default function MethodologyRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const target = `/settings/methodologies/${id}/builder`;
  useEffect(() => {
    router.replace(target);
  }, [router, target]);
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground">
        The YAML editor moved into the builder — forwarding…
      </p>
      <Link href={target} className="text-sm underline">
        Open the builder
      </Link>
    </div>
  );
}
