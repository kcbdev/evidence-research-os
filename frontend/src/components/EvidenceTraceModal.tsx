"use client";

import { useEffect, useState } from "react";
import { getClaimDetail, type ClaimDetail } from "@/lib/api";
import ClaimConfidenceBar from "./ClaimConfidenceBar";

export default function EvidenceTraceModal({
  projectId,
  claimId,
  onClose,
}: {
  projectId: string;
  claimId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    getClaimDetail(projectId, claimId).then(
      (d) => {
        if (!cancelled) setDetail(d);
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, claimId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence trace for ${claimId}`}
      className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/50 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded bg-white p-6 dark:bg-zinc-900 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">{claimId}</h2>
          <button onClick={onClose} aria-label="Close" className="underline">
            Close
          </button>
        </div>
        {error && (
          <p className="mt-2 text-red-600 dark:text-red-400">{error}</p>
        )}
        {!error && !detail && (
          <p className="mt-2 dark:text-zinc-400">Loading trace…</p>
        )}
        {detail && (
          <div className="mt-2 space-y-4">
            <p>{detail.claim.statement}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Status: {detail.claim.status} · Adjudicated by:{" "}
              {detail.claim.adjudicated_by ?? "pending"}
            </p>
            <ClaimConfidenceBar confidence={detail.claim.confidence} />
            <section>
              <h3 className="font-medium">
                Evidence ({detail.evidence.length})
              </h3>
              {detail.evidence.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No backing evidence — an unsupported claim is never
                  SUPPORTED, no matter who agrees.
                </p>
              )}
              <ul className="mt-1 space-y-2">
                {detail.evidence.map((ev) => {
                  const src = detail.sources.find(
                    (s) => s.id === ev.source_id,
                  );
                  return (
                    <li
                      key={ev.id}
                      className="rounded border p-2 text-sm dark:border-zinc-700"
                    >
                      <p className="font-medium">
                        {ev.id}
                        <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                          {ev.evidence_type}/{ev.strength}
                        </span>
                      </p>
                      <blockquote className="mt-1 border-l-2 border-zinc-300 pl-2 dark:border-zinc-600">
                        {ev.text_reference}
                      </blockquote>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                        {ev.location.section ?? ""}{" "}
                        {ev.location.page !== undefined &&
                          `(p. ${ev.location.page})`}
                        {src ? (
                          <>
                            {" — "}
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {src.title}
                            </a>{" "}
                            (tier {src.quality_tier})
                          </>
                        ) : (
                          <> — source {ev.source_id} missing</>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
