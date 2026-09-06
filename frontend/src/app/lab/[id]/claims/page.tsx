"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { listClaims, type ClaimRow } from "@/lib/api";
import ContradictionBadge from "@/components/ContradictionBadge";
import EvidenceTraceModal from "@/components/EvidenceTraceModal";

type SortKey = "confidence" | "status";
type SortDir = 1 | -1;

const STATUSES = [
  "",
  "SUPPORTED",
  "STRONGLY_SUPPORTED",
  "WEAKLY_SUPPORTED",
  "DISPUTED",
  "CONTRADICTED",
  "INSUFFICIENT_EVIDENCE",
  "UNVERIFIABLE",
];

export default function ClaimsPage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [oppositionOnly, setOppositionOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [sortDir, setSortDir] = useState<SortDir>(-1);
  const [openClaim, setOpenClaim] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await listClaims(id, {
          status: status || undefined,
          min_confidence: minConfidence === "" ? undefined : Number(minConfidence),
          has_opposition: oppositionOnly || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, [id, status, minConfidence, oppositionOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === "confidence" ? -1 : 1);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const cmp =
      sortKey === "confidence"
        ? a.confidence - b.confidence
        : a.status.localeCompare(b.status);
    return cmp * sortDir;
  });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href={`/lab/${id}`} className="text-sm underline">
        ← Lab overview
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Claims</h1>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Claim filters"
      >
        <label className="text-sm">
          Status{" "}
          <select
            aria-label="Status filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border px-2 py-1"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "any" : s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Min confidence{" "}
          <input
            aria-label="Min confidence"
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value)}
            className="w-20 rounded border px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <input
            type="checkbox"
            aria-label="Opposition only"
            checked={oppositionOnly}
            onChange={(e) => setOppositionOnly(e.target.checked)}
          />{" "}
          Opposition only
        </label>
      </form>

      {loading && <p className="mt-4">Loading…</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {!loading && !error && (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr>
              <th>ID</th>
              <th>
                <button onClick={() => toggleSort("status")} className="underline">
                  Status {sortKey === "status" ? (sortDir === 1 ? "▲" : "▼") : ""}
                </button>
              </th>
              <th>
                <button
                  onClick={() => toggleSort("confidence")}
                  className="underline"
                >
                  Confidence{" "}
                  {sortKey === "confidence" ? (sortDir === 1 ? "▲" : "▼") : ""}
                </button>
              </th>
              <th>Flags</th>
              <th>Statement</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t hover:bg-zinc-50"
                onClick={() => setOpenClaim(row.id)}
              >
                <td className="py-1 pr-2 font-mono">{row.id}</td>
                <td className="pr-2">{row.status}</td>
                <td className="pr-2 tabular-nums">
                  {row.confidence.toFixed(2)}
                </td>
                <td className="pr-2">
                  <ContradictionBadge opposition={row.opposition} />
                </td>
                <td>{row.statement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {openClaim && (
        <EvidenceTraceModal
          projectId={id}
          claimId={openClaim}
          onClose={() => setOpenClaim(null)}
        />
      )}
    </main>
  );
}
