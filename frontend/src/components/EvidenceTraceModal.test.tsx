import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EvidenceTraceModal from "./EvidenceTraceModal";

const DETAIL = {
  claim: {
    id: "C-1", statement: "s", status: "DISPUTED",
    supporting_sources: ["S-1"], opposing_sources: [],
    confidence: null, adjudicated_by: null,
  },
  evidence: [
    {
      id: "E-1", source_id: "S-1", location: { section: "R" },
      text_reference: "excerpt", supports: ["C-1"],
      evidence_type: "empirical", strength: "high",
    },
  ],
  sources: [{ id: "S-1", url: "https://e.org/1", title: "T1", quality_tier: 2 }],
};

const AUDIT = [
  { claim_id: "C-1", evidence_id: "E-1", stage: "support_match", status: "FAIL", detail: "merely topical" },
  { claim_id: "C-1", evidence_id: null, stage: "existence", status: "FAIL", detail: "cited S-404 missing" },
];

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes("/audits/latest")) {
        return { ok: true, json: async () => ({ audit_run_id: "A-1", results: AUDIT }) };
      }
      if (path.includes("/tasks")) {
        return { ok: true, json: async () => [] };
      }
      if (path.includes("/claims/C-1")) {
        return { ok: true, json: async () => DETAIL };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

describe("EvidenceTraceModal audit badges", () => {
  it("shows per-evidence badge linking to the filtered audit page", async () => {
    render(<EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />);
    const badge = await screen.findByRole("link", { name: /Audit result FAIL for E-1/ });
    expect(badge.getAttribute("href")).toBe("/lab/p/audit?claim=C-1");
  });

  it("shows claim-level sweep failures as a header alert", async () => {
    render(<EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />);
    expect(await screen.findByText("Citation problem: existence FAIL")).toBeDefined();
  });

  it("renders no badges when no audit has run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes("/audits/latest")) {
          return { ok: true, json: async () => ({ audit_run_id: null, results: [] }) };
        }
        if (path.includes("/tasks")) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => DETAIL };
      }),
    );
    render(<EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />);
    await screen.findByText("excerpt");
    expect(screen.queryByText(/Audit result/)).toBeNull();
    expect(screen.queryByText(/Citation problem/)).toBeNull();
  });
});
