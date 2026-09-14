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
  sources: [{ id: "S-1", url: "https://e.org/1", title: "T1", quality_tier: 2, kind: "primary_paper" }],
  consensus: { supporting_weight: 2, opposing_weight: 0, percent_support: 100.0 },
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

  it("renders the consensus meter beside the confidence breakdown", async () => {
    render(<EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />);
    expect(await screen.findByRole("img", { name: /Consensus 100\.0% supporting/ })).toBeDefined();
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

describe("EvidenceTraceModal source viewer (PBI-082)", () => {
  it("renders the cited passage highlighted under a source header", async () => {
    render(<EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />);
    const passage = await screen.findByTestId("cited-passage-S-1");
    expect(passage.tagName).toBe("MARK");
    expect(passage.textContent).toBe("excerpt");
    // Header: title link + kind badge + tier (no new fetch — the stub
    // throws on any unexpected URL, so rendering proves cache-only).
    expect(await screen.findByText("T1")).toBeDefined();
    expect(await screen.findByText("primary_paper")).toBeDefined();
    expect(await screen.findByText("(tier 2)")).toBeDefined();
  });

  it("degrades to title + tier when kind is absent", async () => {
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
        return {
          ok: true,
          json: async () => ({
            ...DETAIL,
            sources: [{ id: "S-1", url: "https://e.org/1", title: "T1", quality_tier: 2 }],
          }),
        };
      }),
    );
    render(<EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />);
    expect(await screen.findByText("T1")).toBeDefined();
    expect(screen.queryByText("primary_paper")).toBeNull();
    expect(await screen.findByTestId("cited-passage-S-1")).toBeDefined();
  });

  it("falls back to plain text when the source is missing", async () => {
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
        return {
          ok: true,
          json: async () => ({
            ...DETAIL,
            evidence: [
              {
                id: "E-9", source_id: "S-9", location: {},
                text_reference: "orphan excerpt", supports: ["C-1"],
                evidence_type: "empirical", strength: "low",
              },
            ],
            sources: [],
          }),
        };
      }),
    );
    render(<EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />);
    expect(await screen.findByText("source S-9 missing")).toBeDefined();
    const passage = await screen.findByTestId("cited-passage-S-9");
    expect(passage.textContent).toBe("orphan excerpt");
  });

  it("renders a placeholder instead of a broken pane for empty excerpts", async () => {
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
        return {
          ok: true,
          json: async () => ({
            ...DETAIL,
            evidence: [
              {
                id: "E-1", source_id: "S-1", location: { section: "R" },
                text_reference: "", supports: ["C-1"],
                evidence_type: "empirical", strength: "high",
              },
            ],
          }),
        };
      }),
    );
    render(<EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />);
    expect(await screen.findByText("(no excerpt recorded)")).toBeDefined();
  });
});
