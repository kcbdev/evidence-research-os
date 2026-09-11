import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DecisionsPage from "./page";

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

describe("DecisionsPage", () => {
  it("renders the episodic log newest-first", async () => {
    stubFetch(() => [
      { id: "D-1", what: "Human approved run", why: "", timestamp: "t1" },
      { id: "D-2", what: "Run ended: completed", why: "calls 3/50", timestamp: "t2" },
    ]);
    render(<DecisionsPage />);
    await screen.findByText("Run ended: completed");
    const items = screen.getAllByRole("listitem");
    // Stored oldest-first, rendered newest-first.
    expect(items[0].textContent).toContain("D-2");
    expect(items[1].textContent).toContain("D-1");
  });

  it("shows the empty state with no decisions", async () => {
    stubFetch(() => []);
    render(<DecisionsPage />);
    expect(await screen.findByText("No decisions yet")).toBeDefined();
  });
});
