import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClaimsPage from "./page";

const ROWS = [
  {
    id: "C-high",
    status: "SUPPORTED",
    confidence: 0.9,
    opposition: 0,
    statement: "strong claim",
  },
  {
    id: "C-low",
    status: "DISPUTED",
    confidence: 0.3,
    opposition: 2,
    statement: "weak claim",
  },
];

const DETAIL = {
  claim: {
    id: "C-low",
    statement: "weak claim",
    status: "DISPUTED",
    supporting_sources: ["S-2"],
    opposing_sources: ["S-1"],
    confidence: {
      source_quality: 0.4,
      methodological_strength: 0.3,
      independent_confirmation: 0.2,
      contradiction_level: 0.8,
      overall: 0.3,
    },
    adjudicated_by: "m-judge",
  },
  evidence: [
    {
      id: "E-1",
      source_id: "S-2",
      location: { section: "Results" },
      text_reference: "excerpt here",
      supports: ["C-low"],
      evidence_type: "empirical",
      strength: "high",
    },
  ],
  sources: [
    { id: "S-2", url: "https://e.org/2", title: "Source Two", quality_tier: 6 },
  ],
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p" }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes("/claims/C-low")) {
        return { ok: true, json: async () => DETAIL };
      }
      if (path.includes("/tasks?claim_id=C-low")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "T-C-low",
              question: "Adjudicate conflicting evidence",
              reason: "Skeptic challenge",
              required_sources: [],
              assigned_agent: "investigator",
            },
          ],
        };
      }
      if (path.includes("/claims")) {
        const query = path.split("?")[1] ?? "";
        let rows = ROWS;
        if (query.includes("status=DISPUTED")) {
          rows = rows.filter((r) => r.status === "DISPUTED");
        }
        if (query.includes("status=CONTRADICTED")) {
          rows = [];
        }
        return { ok: true, json: async () => rows };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

describe("ClaimsPage", () => {
  async function selectOption(name: string) {
    // Base-UI items need pointer sequence, not click alone (probed).
    fireEvent.click(screen.getByRole("combobox", { name: "Status filter" }));
    const option = await screen.findByRole("option", { name });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);
  }

  it("renders rows with badges and opens the trace modal", async () => {
    render(<ClaimsPage />);
    expect(await screen.findByText("strong claim")).toBeDefined();
    expect(screen.getByText("2 opposing")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Open evidence trace for C-low" }));
    // Dialog name comes from DialogTitle via aria-labelledby (base-ui) —
    // scope field asserts to the dialog element itself.
    const dialog = await screen.findByRole("dialog", { name: "C-low" });
    expect(dialog).toBeDefined();
    const q = within(dialog);
    expect(q.getByText("C-low")).toBeDefined(); // the title
    expect(q.getByText("weak claim")).toBeDefined();
    expect(q.getByText(/DISPUTED/)).toBeDefined();
    expect(q.getByText(/m-judge/)).toBeDefined();
    expect(q.getByText("excerpt here")).toBeDefined();
    expect(q.getByText(/empirical\/high/)).toBeDefined();
    expect(q.getByText(/Results/)).toBeDefined();
    expect(q.getByText("Source Two")).toBeDefined();
    expect(q.getByText(/tier 6/)).toBeDefined();
    expect(q.getByText("Overall")).toBeDefined();
    expect(q.getByText("T-C-low")).toBeDefined();
    expect(q.getByText("Adjudicate conflicting evidence")).toBeDefined();
  });

  it("badge button opens the trace modal", async () => {
    render(<ClaimsPage />);
    await screen.findByText("strong claim");
    fireEvent.click(screen.getByRole("button", { name: /2 opposing/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeDefined();
    expect(
      within(dialog).getByText("Adjudicate conflicting evidence"),
    ).toBeDefined();
  });

  it("modal shows empty tasks honestly, trace stands alone", async () => {
    render(<ClaimsPage />);
    await screen.findByText("strong claim");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes("/claims/C-low")) {
          return {
            ok: true,
            json: async () => ({
              claim: {
                id: "C-low",
                statement: "weak claim",
                status: "DISPUTED",
                supporting_sources: [],
                opposing_sources: [],
                confidence: null,
                adjudicated_by: null,
              },
              evidence: [],
              sources: [],
            }),
          };
        }
        if (path.includes("/tasks")) {
          return { ok: true, json: async () => [] };
        }
        if (path.includes("/claims")) {
          return { ok: true, json: async () => [] };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /2 opposing/ }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("No targeted research tasked for this claim."),
    ).toBeDefined();
    expect(within(dialog).getByText("weak claim")).toBeDefined();
  });

  it("tasks fetch failure leaves the trace standing", async () => {
    render(<ClaimsPage />);
    await screen.findByText("strong claim");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes("/tasks")) {
          throw new Error("tasks down");
        }
        if (path.includes("/claims/C-low")) {
          return {
            ok: true,
            json: async () => ({
              claim: {
                id: "C-low",
                statement: "weak claim",
                status: "DISPUTED",
                supporting_sources: [],
                opposing_sources: [],
                confidence: null,
                adjudicated_by: null,
              },
              evidence: [],
              sources: [],
            }),
          };
        }
        if (path.includes("/claims")) {
          return { ok: true, json: async () => [] };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /2 opposing/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("weak claim")).toBeDefined();
    expect(
      within(dialog).getByText("No targeted research tasked for this claim."),
    ).toBeDefined();
  });

  it("filter narrows via refetch", async () => {
    render(<ClaimsPage />);
    await screen.findByText("strong claim");
    await selectOption("DISPUTED");
    expect(await screen.findByText("weak claim")).toBeDefined();
    expect(screen.queryByText("strong claim")).toBeNull();
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      String,
    );
    expect(calls.some((c) => c.includes("status=DISPUTED"))).toBe(true);
  });

  it("empty result shows the no-match message, not a bare table", async () => {
    render(<ClaimsPage />);
    await screen.findByText("strong claim");
    await selectOption("CONTRADICTED");
    expect(await screen.findByText("No claims match these filters.")).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("sort toggle reorders by confidence", async () => {
    render(<ClaimsPage />);
    const rows = await screen.findAllByRole("row");
    // Header + 2 data rows, default confidence desc: high first.
    expect(rows[1].textContent).toContain("C-high");
    fireEvent.click(screen.getByRole("button", { name: /Confidence/ }));
    const flipped = await screen.findAllByRole("row");
    expect(flipped[1].textContent).toContain("C-low");
  });
});
