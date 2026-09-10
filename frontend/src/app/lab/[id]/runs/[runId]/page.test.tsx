import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunView from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p", runId: "r" }),
  useRouter: () => ({ push: vi.fn() }),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Set<(e: object) => void>>();
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: object) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: (e: object) => void) {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type: string, data: unknown) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ data: JSON.stringify(data) });
    }
  }

  emitOpen() {
    for (const handler of this.listeners.get("open") ?? []) {
      handler({});
    }
  }

  close() {
    this.closed = true;
  }
}

const BUDGET = {
  max_model_calls: 50,
  max_research_rounds: 5,
  calls_used: 0,
  rounds_used: 0,
  exhausted: false,
};

let runStatus = "running";

beforeEach(() => {
  FakeEventSource.instances = [];
  runStatus = "running";
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const path = String(url);
      if (path.endsWith("/budget")) {
        return { ok: true, json: async () => BUDGET };
      }
      if (path.endsWith("/approve")) {
        return { ok: true, json: async () => ({ run_id: "r", status: "running" }) };
      }
      if (path.endsWith("/retry")) {
        runStatus = "running";
        return { ok: true, json: async () => ({ run_id: "r", status: "running" }) };
      }
      if (path.endsWith("/runs/r")) {
        return {
          ok: true,
          json: async () => ({
            run_id: "r",
            project_id: "p",
            status: runStatus,
            events: [],
            needs_approval: runStatus === "awaiting_approval",
            error: null,
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }),
  );
});

describe("RunView", () => {
  it("streams node events and completes", async () => {
    render(<RunView />);
    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(1);
    });
    const es = FakeEventSource.instances[0];
    expect(es.url).toContain("/api/v1/lab-projects/p/runs/r/stream");

    es.emit("node", { node: "plan" });
    es.emit("node", { node: "independent_first_pass" });
    expect(await screen.findByText("plan")).toBeDefined();
    expect(screen.getByText("independent_first_pass")).toBeDefined();

    es.emit("run_done", { node: "done" });
    expect(await screen.findByText("Run completed.")).toBeDefined();
  });

  it("opens the approval modal on checkpoint and resubscribes", async () => {
    render(<RunView />);
    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(1);
    });
    const es = FakeEventSource.instances[0];
    es.emit("node", { node: "plan" });
    await screen.findByText("plan");

    es.emit("human_checkpoint", { node: "human_checkpoint" });
    expect(
      await screen.findByRole("dialog", { name: "Human checkpoint approval" }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(2);
    });
    expect(es.closed).toBe(true); // old subscription cleaned up
    const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => String(url).endsWith("/approve"),
    );
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0][1].body as string)).toMatchObject({
      decision: "approve",
    });
  });

  it("ignores stale checkpoint replay after resolve", async () => {
    render(<RunView />);
    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(1);
    });
    const es = FakeEventSource.instances[0];
    es.emit("human_checkpoint", { node: "human_checkpoint" });
    await screen.findByRole("dialog", { name: "Human checkpoint approval" });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(2);
    });
    expect(screen.queryByRole("dialog", { name: "Human checkpoint approval" }))
      .toBeNull();

    // The resubscribed stream replays the same historic checkpoint:
    FakeEventSource.instances[1].emit("human_checkpoint", {
      node: "human_checkpoint",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("dialog", { name: "Human checkpoint approval" }))
      .toBeNull(); // stays shut: single pause per run
  });

  it("rejects with a note and does not resubscribe", async () => {
    render(<RunView />);
    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(1);
    });
    FakeEventSource.instances[0].emit("human_checkpoint", {
      node: "human_checkpoint",
    });
    await screen.findByRole("dialog", { name: "Human checkpoint approval" });

    fireEvent.change(screen.getByLabelText("Approval note"), {
      target: { value: "wrong scope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await screen.findByText("Run rejected by reviewer.");
    expect(FakeEventSource.instances.length).toBe(1); // no resubscribe
    const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => String(url).endsWith("/approve"),
    );
    expect(JSON.parse(posts[0][1].body as string)).toMatchObject({
      decision: "reject",
      note: "wrong scope",
    });
  });

  it("renders resting runs from status without subscribing", async () => {
    runStatus = "done";
    render(<RunView />);
    await screen.findByText("Run completed.");
    await new Promise((r) => setTimeout(r, 50));
    expect(FakeEventSource.instances.length).toBe(0);
  });

  it("shows retry on failed runs and resubscribes after retry", async () => {
    runStatus = "failed";
    // error text comes through the status payload
    const origFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const path = String(url);
        if (path.endsWith("/budget")) {
          return { ok: true, json: async () => BUDGET };
        }
        if (path.endsWith("/retry")) {
          runStatus = "running";
          return { ok: true, json: async () => ({ run_id: "r", status: "running" }) };
        }
        if (path.endsWith("/runs/r")) {
          return {
            ok: true,
            json: async () => ({
              run_id: "r",
              project_id: "p",
              status: runStatus,
              events: [],
              needs_approval: false,
              error: "model exploded",
            }),
          };
        }
        return (origFetch as typeof fetch)(url, init);
      }),
    );
    render(<RunView />);
    expect(await screen.findByText("model exploded")).toBeDefined();
    expect(FakeEventSource.instances.length).toBe(0);
    fireEvent.click(screen.getByText("Retry from last checkpoint"));
    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(1);
    });
  });

  it("reset-on-open prevents replay duplicates", async () => {
    render(<RunView />);
    await vi.waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(1);
    });
    const es = FakeEventSource.instances[0];
    es.emit("node", { node: "plan" });
    await screen.findByText("plan");

    es.emitOpen(); // reconnect replay: slate clears first
    await vi.waitFor(() => {
      expect(screen.queryByText("plan")).toBeNull();
    });
    es.emit("node", { node: "plan" });
    expect(await screen.findByText("plan")).toBeDefined();
  });
});
