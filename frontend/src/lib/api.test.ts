import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLabProject,
  getBudget,
  getClaimDetail,
  listClaims,
  listLabProjects,
  streamRun,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  const json = vi.fn(async () => payload);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json })),
  );
  return json;
}

describe("REST helpers", () => {
  it("lists projects from /api/v1", async () => {
    mockFetchOnce([{ id: "p", title: "T" }]);
    const projects = await listLabProjects();
    expect(projects).toEqual([{ id: "p", title: "T" }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/lab-projects"),
    );
  });

  it("throws on HTTP error", async () => {
    mockFetchOnce({ detail: "x" }, false, 404);
    await expect(getBudget("p")).rejects.toThrow("GET");
  });

  it("creates via POST with JSON body", async () => {
    mockFetchOnce({ id: "lp-1" });
    const created = await createLabProject({ title: "T", question: "q" });
    expect(created).toEqual({ id: "lp-1" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ title: "T" });
  });

  it("builds claim filter query strings", async () => {
    mockFetchOnce([]);
    await listClaims("p", {
      status: "DISPUTED",
      min_confidence: 0.5,
      has_opposition: true,
    });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/api/v1/lab-projects/p/claims?");
    expect(url).toContain("status=DISPUTED");
    expect(url).toContain("min_confidence=0.5");
    expect(url).toContain("has_opposition=true");
  });

  it("omits unset filters", async () => {
    mockFetchOnce([]);
    await listClaims("p", {});
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toEqual(
      expect.stringContaining("/api/v1/lab-projects/p/claims"),
    );
    expect(url).not.toContain("?");
  });

  it("fetches claim trace detail", async () => {
    mockFetchOnce({ claim: { id: "C-1" }, evidence: [], sources: [] });
    const detail = await getClaimDetail("p", "C-1");
    expect(detail.claim.id).toBe("C-1");
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners = new Map<string, Set<(e: object) => void>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
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
    const event = { data: JSON.stringify(data) };
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }

  close() {
    this.closed = true;
  }
}

describe("streamRun", () => {
  it("delivers typed events and cleans up", () => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);

    const seen: { type: string; data: unknown }[] = [];
    const stop = streamRun("p", "r", (e) => seen.push(e));
    const es = FakeEventSource.instances[0];

    expect(es.url).toContain("/api/v1/lab-projects/p/runs/r/stream");
    es.emit("node", { node: "plan" });
    es.emit("human_checkpoint", { node: "human_checkpoint" });
    expect(seen).toEqual([
      { type: "node", data: { node: "plan" } },
      { type: "human_checkpoint", data: { node: "human_checkpoint" } },
    ]);

    stop();
    expect(es.closed).toBe(true);
    expect(
      [...es.listeners.values()].every((set) => set.size === 0),
    ).toBe(true);
  });
});
