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
  description: "keep me",
  is_default: false,
  compatible_modes: ["research"],
  workflow: {
    stages: [
      { id: "plan", node: "plan" },
      { id: "synthesis", node: "synthesis" },
      { id: "final_output", node: "final_output" },
    ],
  },
  tools: { enabled: ["grep_project"] },
  prompts: { set: "x", overrides: {} },
  skills: {},
  models: { scientist: "m" },
  budget_defaults: { max_model_calls: 50, max_research_rounds: 5 },
};

function echoStub() {
  const puts: { url: string; body: Record<string, unknown> }[] = [];
  const handler = (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push({ url, body });
      return body; // echo: server normalizes, shape preserved
    }
    return METHODOLOGY;
  };
  return { puts, handler };
}

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

  it("deletes the head node with no bridge and saves", async () => {
    const { puts, handler } = echoStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Delete Plan" }));
    await vi.waitFor(() => {
      expect(screen.queryByTestId("stage-card-plan")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as { workflow: { stages: { id: string }[] } };
    expect(body.workflow.stages.map((s) => s.id)).toEqual([
      "synthesis",
      "final_output",
    ]);
  });

  it("refuses to save an empty canvas with no PUT", async () => {
    const { puts, handler } = echoStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    for (const label of ["Plan", "Synthesis", "Final Output"]) {
      fireEvent.click(screen.getByRole("button", { name: `Delete ${label}` }));
      await vi.waitFor(() => {
        expect(
          screen.queryByTestId(`stage-card-${label.toLowerCase().replace(/ /g, "_")}`),
        ).toBeNull();
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Canvas is empty/)).toBeDefined();
    expect(puts.length).toBe(0);
  });

  it("preserves unmodeled fields and loop keys through a no-touch save", async () => {
    const rich = {
      ...METHODOLOGY,
      workflow: {
        stages: [
          {
            id: "plan",
            node: "plan",
            loop_condition: "x > 1",
            loop_target: "synthesis",
            interrupt: true,
          },
          { id: "synthesis", node: "synthesis" },
        ],
      },
    };
    const { puts, handler } = echoStub();
    stubFetch((url, init) => (init?.method === "PUT" ? handler(url, init) : rich));
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as typeof METHODOLOGY & {
      workflow: { stages: Record<string, unknown>[] };
    };
    expect(body.description).toBe("keep me");
    expect(body.models).toEqual({ scientist: "m" });
    expect(body.tools).toEqual({ enabled: ["grep_project"] });
    expect(body.compatible_modes).toEqual(["research"]);
    expect(body.workflow.stages[0]).toMatchObject({
      id: "plan",
      loop_condition: "x > 1",
      loop_target: "synthesis",
      interrupt: true,
    });
  });

  it("bridges across a multi-select block delete", async () => {
    const four = {
      ...METHODOLOGY,
      workflow: {
        stages: [
          { id: "a", node: "plan" },
          { id: "b", node: "synthesis" },
          { id: "c", node: "citation_audit" },
          { id: "d", node: "final_output" },
        ],
      },
    };
    const { puts, handler } = echoStub();
    stubFetch((url, init) => (init?.method === "PUT" ? handler(url, init) : four));
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-a");
    // RF tracks the multi-select modifier via real keydown state, not
    // the click event's flags — hold Control (and Meta for macOS RF
    // builds) around the second click, exactly like a keyboard does.
    fireEvent.click(screen.getByTestId("stage-card-b"));
    fireEvent.keyDown(document, { key: "Control", code: "ControlLeft" });
    fireEvent.keyDown(document, { key: "Meta", code: "MetaLeft" });
    fireEvent.click(screen.getByTestId("stage-card-c"));
    fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });
    fireEvent.keyUp(document, { key: "Meta", code: "MetaLeft" });
    fireEvent.keyDown(document, { key: "Backspace", code: "Backspace" });
    fireEvent.keyDown(document, { key: "Backspace", code: "Backspace" });
    await vi.waitFor(() => {
      expect(screen.queryByTestId("stage-card-b")).toBeNull();
    });
    expect(screen.queryByTestId("stage-card-c")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as { workflow: { stages: { id: string }[] } };
    expect(body.workflow.stages.map((s) => s.id)).toEqual(["a", "d"]);
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
