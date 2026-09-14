import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditPage from "./page";

const ROWS = [
  { claim_id: "C-1", evidence_id: "E-1", stage: "existence", status: "PASS", detail: "" },
  { claim_id: "C-1", evidence_id: "E-1", stage: "pincite", status: "WARNING", detail: "Section 'methods' not found" },
  { claim_id: "C-1", evidence_id: "E-1", stage: "support_match", status: "FAIL", detail: "merely topical" },
];

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p" }),
  useSearchParams: () => new URLSearchParams(),
}));

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => handler(url.toString(), init),
      text: async () => "",
    })),
  );
}

const SUMMARY = {
  audit_run_id: "A-001",
  total_checks: 3,
  pass_rate: 1 / 3,
  by_stage: {
    existence: { PASS: 1, WARNING: 0, FAIL: 0, total: 1 },
    pincite: { PASS: 0, WARNING: 1, FAIL: 0, total: 1 },
    support_match: { PASS: 0, WARNING: 0, FAIL: 1, total: 1 },
  },
  by_status: { PASS: 1, WARNING: 1, FAIL: 1 },
};

function rowsThenSummary(url: string, fallback: unknown) {
  if (url.includes("/audits/summary")) return SUMMARY;
  return fallback;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("AuditPage", () => {
  it("renders rows with stage badges and expands reasoning", async () => {
    stubFetch((url) =>
      rowsThenSummary(url, { audit_run_id: "A-001", results: ROWS }),
    );
    render(<AuditPage />);
    expect(await screen.findByText("A-001")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Show reasoning for C-1 support_match/ }));
    expect(await screen.findByText("merely topical")).toBeDefined();
  });

  it("shows the empty state before any run", async () => {
    stubFetch((url) => {
      if (url.includes("/audits/summary")) {
        return {
          audit_run_id: null,
          total_checks: 0,
          pass_rate: null,
          by_stage: {},
          by_status: { PASS: 0, WARNING: 0, FAIL: 0 },
        };
      }
      return { audit_run_id: null, results: [] };
    });
    render(<AuditPage />);
    expect(await screen.findByText("No audit results")).toBeDefined();
    expect(screen.queryByTestId("audit-pass-rate")).toBeNull();
  });

  it("re-runs and reloads", async () => {
    let calls = 0;
    stubFetch((url, init) => {
      if (url.includes("/rerun")) {
        calls += 1;
        return { audit_run_id: "A-002", rows: 3, failed: true };
      }
      if (url.includes("/audits/summary")) return SUMMARY;
      return { audit_run_id: calls > 0 ? "A-002" : "A-001", results: ROWS };
    });
    render(<AuditPage />);
    await screen.findByText("A-001");
    fireEvent.click(screen.getByText("Re-run audit"));
    expect(await screen.findByText("A-002")).toBeDefined();
  });

  it("surfaces load errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "boom",
      })),
    );
    render(<AuditPage />);
    expect(await screen.findByText("Something went wrong")).toBeDefined();
  });

  it("renders the pass-rate quality summary with per-stage counts", async () => {
    stubFetch((url) =>
      rowsThenSummary(url, { audit_run_id: "A-001", results: ROWS }),
    );
    render(<AuditPage />);
    expect(await screen.findByTestId("audit-pass-rate")).toBeDefined();
    expect(await screen.findByText("33% pass rate")).toBeDefined();
    expect(await screen.findByText("existence: 1/1 passed")).toBeDefined();
  });
});
