import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./page";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/v1/lab-projects")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "lp-1",
              title: "Bone Study",
              mode: "research",
              question: "does D help?",
              claims_count: 3,
            },
          ],
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

describe("Dashboard", () => {
  it("lists projects from the live API shape", async () => {
    render(<Dashboard />);
    expect(await screen.findByText("Bone Study")).toBeDefined();
    expect(screen.getByText("does D help?")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Bone Study" }).getAttribute("href"),
    ).toBe("/lab/lp-1");
  });

  it("links to the new-lab flow instead of an inline form", async () => {
    render(<Dashboard />);
    await screen.findByText("Bone Study"); // settle async load
    const link = screen.getByRole("link", { name: "New Lab Project" });
    expect(link.getAttribute("href")).toBe("/lab/new");
    // No inline creation here anymore (PBI-050 moved it to /lab/new).
    expect(screen.queryByPlaceholderText("Title")).toBeNull();
  });
});
