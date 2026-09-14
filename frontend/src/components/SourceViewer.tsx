"use client";

import { Badge } from "@/components/ui/badge";

export interface SourceViewerSource {
  id: string;
  url: string;
  title: string;
  quality_tier: number;
  // Backend ships `kind` on the source payload (Source model); the
  // ClaimDetail typing predates it, so it arrives untyped. Absent on
  // old fixtures — the header degrades to title + tier, never a gap.
  kind?: string;
}

/** In-context source viewer (PBI-082, C10): source header (title,
 * kind, tier) with the cited passage highlighted in place via
 * `<mark>`. The claim-detail payload carries only the excerpt string
 * — no cached page text reaches the browser — so the plain excerpt
 * IS the display (explicit graceful fallback per the PBI, never a
 * broken pane, never a second fetch path: this component calls no
 * API). Empty excerpts render a placeholder line, not nothing. */
export default function SourceViewer({
  source,
  sourceId,
  passage,
  locationSection,
  locationPage,
}: {
  source: SourceViewerSource | undefined;
  sourceId: string;
  passage: string;
  locationSection?: string;
  locationPage?: number;
}) {
  return (
    <div data-testid={`source-viewer-${sourceId}`}>
      {source ? (
        <p className="font-medium">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {source.title}
          </a>{" "}
          {source.kind && <Badge variant="outline">{source.kind}</Badge>}{" "}
          <span className="font-normal text-muted-foreground">
            (tier {source.quality_tier})
          </span>
        </p>
      ) : (
        <p className="font-medium text-muted-foreground">
          source {sourceId} missing
        </p>
      )}
      {passage ? (
        <blockquote className="mt-1 border-l-2 border-zinc-300 pl-2 dark:border-zinc-600">
          <mark data-testid={`cited-passage-${sourceId}`}>{passage}</mark>
        </blockquote>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          (no excerpt recorded)
        </p>
      )}
      {(locationSection || locationPage !== undefined) && (
        <p className="mt-1 text-muted-foreground">
          {locationSection ?? ""}{" "}
          {locationPage !== undefined && `(p. ${locationPage})`}
        </p>
      )}
    </div>
  );
}
