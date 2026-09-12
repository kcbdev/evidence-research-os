import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BuilderPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "m1" }),
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoopResizeObserver);
// cmdk scrolls the highlighted item into view; jsdom has no layout.
Element.prototype.scrollIntoView = function () {};

const METHODOLOGY = {
  id: "m1",
  name: "Pipe",
  description: "",
  is_default: false,
  compatible_modes: ["research"],
  workflow: {
    stages: [
      { id: "plan", node: "plan" },
      { id: "synthesis", node: "synthesis" },
      { id: "final_output", node: "final_output" },
    ],
  },
  tools: { enabled: [] },
  prompts: { set: "x", overrides: {} },
  skills: {},
  models: {},
  budget_defaults: { max_model_calls: 50, max_research_rounds: 5 },
};

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
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
});

describe("BuilderPage", () => {
  it("renders the loaded stages as canvas nodes", async () => {
    stubFetch(() => METHODOLOGY);
    render(<BuilderPage />);
    expect(await screen.findByTestId("stage-card-plan")).toBeDefined();
    expect(screen.getByTestId("stage-card-synthesis")).toBeDefined();
    expect(screen.getByTestId("stage-card-final_output")).toBeDefined();
  });

  it("adds a stage from the palette and saves the longer chain", async () => {
    const puts: { url: string; body: { workflow: { stages: { id: string }[] } } }[] = [];
    stubFetch((url, init) => {
      if (init?.method === "PUT") {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return METHODOLOGY;
      }
      return METHODOLOGY;
    });
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("Citation Audit"));
    expect(await screen.findByTestId("stage-card-citation_audit")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    expect(puts[0].url.endsWith("/api/v1/methodologies/m1")).toBe(true);
    expect(puts[0].body.workflow.stages.map((s) => s.id)).toEqual([
      "plan",
      "synthesis",
      "final_output",
      "citation_audit",
    ]);
  });

  it("deletes a stage and saves the shorter chain", async () => {
    const puts: { url: string; body: { workflow: { stages: { id: string }[] } } }[] = [];
    stubFetch((url, init) => {
      if (init?.method === "PUT") {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return METHODOLOGY;
      }
      return METHODOLOGY;
    });
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Delete Synthesis" }));
    // deleteElements is async inside React Flow — the removal lands a
    // microtask after the click, so poll instead of asserting sync.
    await vi.waitFor(() => {
      expect(screen.queryByTestId("stage-card-synthesis")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    // Deleting a middle node drops its edges too: the remaining two
    // reconnect implicitly by chain order (plan → final_output).
    expect(puts[0].body.workflow.stages.map((s) => s.id)).toEqual([
      "plan",
      "final_output",
    ]);
  });

  it("opens the palette with Cmd+K", async () => {
    stubFetch(() => METHODOLOGY);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(await screen.findByPlaceholderText("Search stages…")).toBeDefined();
  });

  it("surfaces load errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    render(<BuilderPage />);
    expect(await screen.findByText("Something went wrong")).toBeDefined();
  });
});
