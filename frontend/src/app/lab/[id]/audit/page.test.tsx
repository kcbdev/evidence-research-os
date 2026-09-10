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
      json: async () => handler(url, init),
      text: async () => "",
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("AuditPage", () => {
  it("renders rows with stage badges and expands reasoning", async () => {
    stubFetch(() => ({ audit_run_id: "A-001", results: ROWS }));
    render(<AuditPage />);
    expect(await screen.findByText("A-001")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Show reasoning for C-1 support_match/ }));
    expect(await screen.findByText("merely topical")).toBeDefined();
  });

  it("shows the empty state before any run", async () => {
    stubFetch(() => ({ audit_run_id: null, results: [] }));
    render(<AuditPage />);
    expect(await screen.findByText("No audit results")).toBeDefined();
  });

  it("re-runs and reloads", async () => {
    let calls = 0;
    stubFetch((url, init) => {
      if (url.includes("/rerun")) {
        calls += 1;
        return { audit_run_id: "A-002", rows: 3, failed: true };
      }
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
});
