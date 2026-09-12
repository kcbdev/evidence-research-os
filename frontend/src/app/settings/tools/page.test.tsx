import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ToolsPage from "./page";

vi.mock("next/navigation", () => ({}));

const TOOLS = [
  { name: "grep_project", description: "g", source: "backend-local" },
  { name: "fetch_url", description: "f", source: "backend-local" },
];

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("ToolsPage", () => {
  it("renders the read-only registry with no write affordance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => TOOLS,
        text: async () => "",
      })),
    );
    render(<ToolsPage />);
    expect(await screen.findByText("grep_project")).toBeDefined();
    expect(screen.getByText("fetch_url")).toBeDefined();
    expect(screen.getAllByText("backend-local").length).toBe(2);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/backend concern/)).toBeDefined();
  });

  it("surfaces load errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    render(<ToolsPage />);
    expect(await screen.findByText("Something went wrong")).toBeDefined();
  });
});
