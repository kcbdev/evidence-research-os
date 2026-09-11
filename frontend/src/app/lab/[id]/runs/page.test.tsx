import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunsPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p" }),
}));

function stubFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => handler(url),
      text: async () => "",
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("RunsPage", () => {
  it("lists runs newest-first with detail links", async () => {
    stubFetch(() => [
      { run_id: "r2", status: "done", needs_approval: false, events_count: 5, error: null, mode: "research", methodology_id: "deep-research-council-v1" },
      { run_id: "r1", status: "awaiting_approval", needs_approval: true, events_count: 3, error: null, mode: "brainstorm", methodology_id: "brainstorm-ideation-v1" },
    ]);
    render(<RunsPage />);
    expect(await screen.findByText("r2")).toBeDefined();
    expect(screen.getByText("needs approval", { exact: false })).toBeDefined();
    expect(screen.getByText("deep-research-council-v1")).toBeDefined();
    expect(screen.getByRole("link", { name: "Open run r1" }).getAttribute("href")).toBe("/lab/p/runs/r1");
  });

  it("shows the empty state with no runs", async () => {
    stubFetch(() => []);
    render(<RunsPage />);
    expect(await screen.findByText("No runs yet")).toBeDefined();
  });
});
