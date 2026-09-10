import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GraphPage from "./page";

const DATA = {
  nodes: [
    { id: "C-1", type: "claim", status: "DISPUTED", statement: "strong claim here" },
    { id: "E-1", type: "evidence", excerpt: "gains", strength: "high" },
    { id: "S-1", type: "source", title: "paper", url: "https://e.org/1" },
  ],
  edges: [
    { from: "E-1", to: "C-1", relation: "supports" },
    { from: "S-1", to: "E-1", relation: "references" },
  ],
};

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

describe("GraphPage", () => {
  it("renders nodes, edges count, and legend", async () => {
    stubFetch(() => DATA);
    render(<GraphPage />);
    expect(await screen.findByText("Evidence graph")).toBeDefined();
    expect(screen.getByText("Read-only — click a node for detail. 3 nodes, 2 edges.", { exact: false })).toBeDefined();
    expect(screen.getByRole("img", { name: /Evidence graph: 3 nodes/ })).toBeDefined();
  });

  it("selects a node into the detail panel", async () => {
    stubFetch(() => DATA);
    render(<GraphPage />);
    await screen.findByText("Evidence graph");
    fireEvent.click(screen.getByRole("button", { name: "claim C-1" }));
    expect(await screen.findByText("DISPUTED")).toBeDefined();
    expect(screen.getByText("Open in claims table →")).toBeDefined();
  });

  it("shows the empty state when the filter matches nothing", async () => {
    stubFetch(() => ({ nodes: [], edges: [] }));
    render(<GraphPage />);
    expect(await screen.findByText("No graph yet")).toBeDefined();
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
    render(<GraphPage />);
    expect(await screen.findByText("Couldn’t load the graph")).toBeDefined();
  });
});
