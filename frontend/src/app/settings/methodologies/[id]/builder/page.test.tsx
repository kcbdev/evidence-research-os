import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BuilderPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "m1" }),
}));
// Canvas DOM shims (ResizeObserver, scrollIntoView) live in
// src/test-setup.ts — shared with later builder suites.

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
    return libraryFallback(url) ?? METHODOLOGY;
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

// Library endpoints the builder page loads alongside the methodology.
// Old stubs answering METHODOLOGY for every URL would crash the page's
// .map calls — route them to honest empty shapes instead.
const CONDITION_FIELDS = [
  { field: "open_contradictions", type: "count" },
  { field: "pending_tasks", type: "count" },
  { field: "audit_passed", type: "bool" },
  { field: "escalate", type: "bool" },
  { field: "needs_human_approval", type: "bool" },
];

function libraryFallback(url: string): unknown {
  if (url.includes("openrouter.ai")) return { data: [] };
  if (url.endsWith("/api/v1/roles")) return [];
  if (url.endsWith("/api/v1/prompts")) return [];
  if (url.endsWith("/api/v1/skills")) return [];
  if (url.endsWith("/api/v1/tools")) return [];
  if (url.endsWith("/api/v1/custom-nodes")) return [];
  if (url.endsWith("/api/v1/methodologies/condition-fields")) return CONDITION_FIELDS;
  if (url.endsWith("/api/v1/methodologies")) return [];
  return undefined;
}

describe("BuilderPage", () => {
  it("renders the loaded stages as canvas nodes", async () => {
    stubFetch((url) => libraryFallback(url) ?? METHODOLOGY);
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
      return libraryFallback(url) ?? METHODOLOGY;
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
      return libraryFallback(url) ?? METHODOLOGY;
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
    stubFetch((url) => libraryFallback(url) ?? METHODOLOGY);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(await screen.findByPlaceholderText("Search nodes…")).toBeDefined();
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
    stubFetch((url, init) =>
      init?.method === "PUT" ? handler(url, init) : (libraryFallback(url) ?? rich),
    );
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
    stubFetch((url, init) =>
      init?.method === "PUT" ? handler(url, init) : (libraryFallback(url) ?? four),
    );
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

const LIB_ROLE = {
  id: "red-team",
  name: "Red Team",
  description: "d",
  system_prompt: "Find flaws.",
  prompt_ref: null,
  tools: ["grep_project"],
  model: "m-test",
  output_schema: null,
  skills: [],
};

const CODE_NODE = {
  node_id: "experiment_scorer",
  filename: "experiment_scorer.py",
  description: "Example Tier C custom node.",
  load_error: null,
};

function libraryStub(
  extra?: (url: string, init?: RequestInit) => unknown,
) {
  const puts: { url: string; body: Record<string, unknown> }[] = [];
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const handler = (url: string, init?: RequestInit) => {
    if (extra) {
      const out = extra(url, init);
      if (out !== undefined) return out;
    }
    // GET branches only: method-specific handlers below must see
    // POST/PUT first (an unguarded endsWith swallows writes — debugged
    // the hard way: role POSTs vanishing into the list branch).
    const isWrite = init?.method === "POST" || init?.method === "PUT";
    if (!isWrite) {
      if (url.includes("openrouter.ai")) return { data: [] };
      if (url.endsWith("/api/v1/roles")) return [LIB_ROLE];
      if (url.endsWith("/api/v1/prompts")) return [];
      if (url.endsWith("/api/v1/skills")) return [];
      if (url.endsWith("/api/v1/tools")) {
        return [
          { name: "grep_project", description: "g", source: "backend-local" },
          { name: "keyword_search", description: "k", source: "backend-local" },
          { name: "semantic_search", description: "s", source: "backend-local" },
        ];
      }
      if (url.endsWith("/api/v1/custom-nodes")) return [CODE_NODE];
      if (url.endsWith("/api/v1/methodologies/condition-fields")) return CONDITION_FIELDS;
      if (url.endsWith("/api/v1/methodologies")) return [];
    }
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push({ url, body });
      return body;
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ url, body });
      return body;
    }
    return METHODOLOGY;
  };
  return { puts, posts, handler };
}

describe("BuilderPage roles and code", () => {
  it("palette lists library roles and discovered code", async () => {
    const { handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    expect(await screen.findByText("Red Team")).toBeDefined();
    expect(screen.getByText("experiment_scorer.py")).toBeDefined();
    expect(screen.getByText("+ Create new custom role")).toBeDefined();
  });

  it("places a library role and saves the embedded spec", async () => {
    const { puts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("Red Team"));
    expect(await screen.findByTestId("role-card-red-team")).toBeDefined();
    expect(screen.getByText("m-test")).toBeDefined();
    expect(screen.getByText("1 tools")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      workflow: { stages: { id: string; node: string }[] };
      custom_roles: { id: string; system_prompt: string; tools: string[]; model: string }[];
    };
    expect(body.workflow.stages.map((s) => s.node)).toEqual([
      "plan",
      "synthesis",
      "final_output",
      "red-team",
    ]);
    expect(body.custom_roles).toMatchObject([
      { id: "red-team", system_prompt: "Find flaws.", tools: ["grep_project"], model: "m-test" },
    ]);
  });

  it("places a custom code node with no editable surface", async () => {
    const { puts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("experiment_scorer.py"));
    expect(await screen.findByTestId("code-card-experiment_scorer")).toBeDefined();
    expect(screen.getByText("Authored in code")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      workflow: { stages: { id: string; node: string }[] };
      custom_roles?: unknown[];
    };
    expect(body.workflow.stages.map((s) => s.node)).toContain("experiment_scorer");
    expect(body.custom_roles ?? []).toEqual([]);
    // Inspector is read-only: path text renders, no text inputs.
    fireEvent.click(screen.getByTestId("code-card-experiment_scorer"));
    const sheet = await screen.findByRole("dialog", { name: "experiment_scorer.py" });
    expect(within(sheet).getByText(/NODE_ID: experiment_scorer/)).toBeDefined();
    expect(within(sheet).queryByRole("textbox")).toBeNull();
  });

  it("creates a role from the palette and auto-places it", async () => {
    const { puts, posts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("+ Create new custom role"));
    const dlg = await screen.findByRole("dialog", { name: "New Role" });
    fireEvent.change(within(dlg).getByLabelText("ID"), { target: { value: "blue-team" } });
    fireEvent.change(within(dlg).getByLabelText("Name"), { target: { value: "Blue Team" } });
    fireEvent.change(within(dlg).getByLabelText("System prompt"), {
      target: { value: "Defend." },
    });
    // The canvas refuses model-less placements (unrunnable at run
    // time) — set a model so auto-place proceeds.
    fireEvent.change(within(dlg).getByLabelText("Role model"), {
      target: { value: "m-blue" },
    });
    fireEvent.click(within(dlg).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(posts.length).toBe(1);
    });
    expect(posts[0].url.endsWith("/api/v1/roles")).toBe(true);
    expect(await screen.findByTestId("role-card-blue-team")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      custom_roles: { id: string; system_prompt: string }[];
    };
    expect(body.custom_roles).toMatchObject([{ id: "blue-team", system_prompt: "Defend.", model: "m-blue" }]);
  });

  it("role inspector overrides the embedded model copy", async () => {
    const { puts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("Red Team"));
    await screen.findByTestId("role-card-red-team");
    fireEvent.click(screen.getByTestId("role-card-red-team"));
    const sheet = await screen.findByRole("dialog", { name: "Red Team" });
    expect(within(sheet).getByText("Library entry")).toBeDefined();
    fireEvent.click(within(sheet).getByRole("switch", { name: "Override model for this methodology" }));
    const modelInput = within(sheet).getByLabelText("Role model override");
    fireEvent.change(modelInput, { target: { value: "override-model" } });
    // The open Sheet inerts the background page (Base-UI modal) — close
    // it before reaching the header Save, like a user would.
    fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      custom_roles: { id: string; model: string }[];
    };
    expect(body.custom_roles).toMatchObject([{ id: "red-team", model: "override-model" }]);
  });

  it("stage inspector toggles the approval interrupt", async () => {
    const { puts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByTestId("stage-card-plan"));
    const sheet = await screen.findByRole("dialog", { name: "Plan" });
    fireEvent.click(within(sheet).getByRole("switch", { name: "Pause here for approval" }));
    // Sheet overlay blocks page clicks in some drivers — close first.
    fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      workflow: { stages: { id: string; interrupt?: boolean }[] };
    };
    expect(body.workflow.stages.find((s) => s.id === "plan")).toMatchObject({
      interrupt: true,
    });
  });

  it("inspector sheet resizes via the drag handle", async () => {
    const { handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByTestId("stage-card-plan"));
    const sheet = await screen.findByRole("dialog", { name: "Plan" });
    const content = sheet as HTMLElement;
    const handle = within(sheet).getByRole("separator", { name: "Resize inspector" });
    fireEvent.mouseDown(handle, { clientX: 500 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
    // Native dispatches run outside RTL's act() — poll for the flush.
    await vi.waitFor(() => {
      expect(content.style.width).toBe("520px");
    });
  });

  it("toggling a model override off reverts to the library snapshot", async () => {
    const { puts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("Red Team"));
    await screen.findByTestId("role-card-red-team");
    fireEvent.click(screen.getByTestId("role-card-red-team"));
    const sheet = await screen.findByRole("dialog", { name: "Red Team" });
    const toggle = within(sheet).getByRole("switch", {
      name: "Override model for this methodology",
    });
    fireEvent.click(toggle);
    fireEvent.change(within(sheet).getByLabelText("Role model override"), {
      target: { value: "stale-model" },
    });
    fireEvent.click(toggle); // OFF reverts, never keeps stale values
    fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      custom_roles: { id: string; model: string }[];
    };
    expect(body.custom_roles).toMatchObject([{ id: "red-team", model: "m-test" }]);
  });

  it("refuses to place a model-less role", async () => {
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/roles")) {
        return [{ ...LIB_ROLE, id: "ghost", name: "Ghost", model: "" }];
      }
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("Ghost"));
    expect(await screen.findByText(/has no model set/)).toBeDefined();
    expect(screen.queryByTestId("role-card-ghost")).toBeNull();
    expect(puts.length).toBe(0);
  });

  it("prunes orphaned embeds when their node is deleted", async () => {
    const { puts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("Red Team"));
    await screen.findByTestId("role-card-red-team");
    fireEvent.click(screen.getByRole("button", { name: "Delete Red Team" }));
    await vi.waitFor(() => {
      expect(screen.queryByTestId("role-card-red-team")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      custom_roles?: unknown[];
      workflow: { stages: { node: string }[] };
    };
    expect(body.workflow.stages.map((s) => s.node)).not.toContain("red-team");
    expect(body.custom_roles ?? []).toEqual([]);
  });

  it("one embed serves every node using the role", async () => {
    const { puts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    fireEvent.click(await screen.findByText("Red Team"));
    await screen.findByTestId("role-card-red-team");
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    // The canvas card already shows "Red Team" — scope the second pick
    // to the palette dialog to avoid the ambiguity.
    const pal = await screen.findByRole("dialog", { name: "Command Palette" });
    fireEvent.click(within(pal).getByRole("option", { name: /Red Team/ }));
    await screen.findByTestId("role-card-red-team-2");
    // Override through the first inspector: both badges follow, one entry.
    fireEvent.click(screen.getByTestId("role-card-red-team"));
    const sheet = await screen.findByRole("dialog", { name: "Red Team" });
    fireEvent.click(
      within(sheet).getByRole("switch", { name: "Override model for this methodology" }),
    );
    fireEvent.change(within(sheet).getByLabelText("Role model override"), {
      target: { value: "shared-override" },
    });
    expect(screen.getByTestId("role-card-red-team-2")).toBeDefined();
    fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      custom_roles: { id: string; model: string }[];
    };
    expect(body.custom_roles).toMatchObject([{ id: "red-team", model: "shared-override" }]);
    expect(body.custom_roles.filter((r) => r.id === "red-team").length).toBe(1);
  });

  it("copy-path copies the repo-relative path", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    try {
      const { handler } = libraryStub();
      stubFetch(handler);
      render(<BuilderPage />);
      await screen.findByTestId("stage-card-plan");
      fireEvent.click(screen.getByRole("button", { name: "Add node" }));
      fireEvent.click(await screen.findByText("experiment_scorer.py"));
      await screen.findByTestId("code-card-experiment_scorer");
      fireEvent.click(screen.getByTestId("code-card-experiment_scorer"));
      const sheet = await screen.findByRole("dialog", { name: "experiment_scorer.py" });
      fireEvent.click(within(sheet).getByRole("button", { name: "Copy path" }));
      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalledWith("backend/custom_nodes/experiment_scorer.py");
      });
      expect(await within(sheet).findByText("Copied.")).toBeDefined();
    } finally {
      delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });
});

function loopMethodology(stages: Record<string, unknown>[]) {
  return {
    ...METHODOLOGY,
    workflow: { stages },
  };
}

describe("BuilderPage conditions", () => {
  it("inspector shows condition rows and + AND extends the saved expression", async () => {
    const doc = loopMethodology([
      {
        id: "plan",
        node: "plan",
        loop_condition: "len(open_contradictions) > 0",
        loop_target: "synthesis",
      },
      { id: "synthesis", node: "synthesis" },
      { id: "final_output", node: "final_output" },
    ]);
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByTestId("stage-card-plan"));
    const sheet = await screen.findByRole("dialog", { name: "Plan" });
    expect(within(sheet).getByText("Repeat this stage while:")).toBeDefined();
    expect(within(sheet).getByText("→ synthesis")).toBeDefined();
    fireEvent.click(within(sheet).getByRole("button", { name: "+ AND" }));
    // The open Sheet inerts the background page — close it before Save.
    fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      workflow: { stages: { id: string; loop_condition?: string }[] };
    };
    expect(
      body.workflow.stages.find((s) => s.id === "plan")?.loop_condition,
    ).toBe("len(open_contradictions) > 0 and len(open_contradictions) > 0");
  });

  it("complex expressions disable the rows with the note, editable in advanced mode", async () => {
    const doc = loopMethodology([
      {
        id: "plan",
        node: "plan",
        loop_condition: "len(open_contradictions) > 0 or audit_passed == True",
        loop_target: "synthesis",
      },
      { id: "synthesis", node: "synthesis" },
    ]);
    const { handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByTestId("stage-card-plan"));
    const sheet = await screen.findByRole("dialog", { name: "Plan" });
    expect(
      within(sheet).getByText(/too complex to edit visually/),
    ).toBeDefined();
    // The rows must stay disabled: re-enabling edits would recompile
    // and silently discard the `or` the rows cannot represent.
    expect(
      (within(sheet).getByRole("button", { name: "+ AND" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(
      within(sheet).getByRole("button", { name: /Advanced: edit as expression/ }),
    );
    const box = within(sheet).getByLabelText("Loop condition expression");
    expect((box as HTMLTextAreaElement).value).toContain(" or ");
  });

  it("registry loop_while conflicts with the builder instead of double-setting", async () => {
    // Both branch forms set (hand-YAML): the canvas draws the
    // condition edge and the builder shows the conflict instead of
    // letting a second form accumulate.
    const doc = loopMethodology([
      {
        id: "plan",
        node: "plan",
        loop_while: "has_open_contradictions",
        loop_condition: "len(open_contradictions) > 0",
        loop_target: "synthesis",
      },
      { id: "synthesis", node: "synthesis" },
    ]);
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByTestId("stage-card-plan"));
    const sheet = await screen.findByRole("dialog", { name: "Plan" });
    expect(within(sheet).getByText(/mutually exclusive/)).toBeDefined();
    expect(
      (within(sheet).getByRole("button", { name: "+ AND" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // The conflict must also hold at save: no PUT, client names plan.
    fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/both loop_while and loop_condition/)).toBeDefined();
    expect(puts.length).toBe(0);
  });

  it("a loop pointing nowhere fails loud with no PUT", async () => {
    const doc = loopMethodology([
      {
        id: "plan",
        node: "plan",
        loop_condition: "len(open_contradictions) > 0",
        loop_target: "ghost",
      },
      { id: "synthesis", node: "synthesis" },
    ]);
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/unknown stage ghost/)).toBeDefined();
    expect(puts.length).toBe(0);
  });

  it("hand-authored loop_always round-trips untouched with an inspector note", async () => {
    const doc = loopMethodology([
      { id: "plan", node: "plan", loop_always: "synthesis" },
      { id: "synthesis", node: "synthesis", route: "route_audit" },
      { id: "final_output", node: "final_output" },
    ]);
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByTestId("stage-card-plan"));
    const sheet = await screen.findByRole("dialog", { name: "Plan" });
    expect(within(sheet).getByText(/Hand-authored loop_always/)).toBeDefined();
    fireEvent.keyDown(sheet, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      workflow: { stages: Record<string, unknown>[] };
    };
    // Exact shapes: the canvas must neither inject nor drop sibling
    // keys on hand-owned stages (subset matching would hide both).
    expect(body.workflow.stages[0]).toEqual({
      id: "plan",
      node: "plan",
      loop_always: "synthesis",
    });
    expect(body.workflow.stages[1]).toEqual({
      id: "synthesis",
      node: "synthesis",
      route: "route_audit",
    });
  });

  it("deleting a loop target clears the loop keys with a notice", async () => {
    const doc = loopMethodology([
      {
        id: "plan",
        node: "plan",
        loop_condition: "len(open_contradictions) > 0",
        loop_target: "synthesis",
      },
      { id: "synthesis", node: "synthesis" },
      { id: "final_output", node: "final_output" },
    ]);
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("button", { name: "Delete Synthesis" }));
    await vi.waitFor(() => {
      expect(screen.queryByTestId("stage-card-synthesis")).toBeNull();
    });
    // The loop cannot survive its target: keys cleared now with a
    // notice, or every later save would 422 on a dead target.
    expect(await screen.findByText(/Removed loop-backs/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      workflow: {
        stages: {
          id: string;
          loop_condition?: string;
          loop_target?: string;
        }[];
      };
    };
    const plan = body.workflow.stages.find((s) => s.id === "plan");
    expect(plan?.loop_condition).toBeUndefined();
    expect(plan?.loop_target).toBeUndefined();
  });
});

describe("BuilderPage tabs", () => {
  it("roles tab highlights judge overlap live and saves models", async () => {
    const doc = loopMethodology([
      { id: "plan", node: "plan" },
      { id: "final_output", node: "final_output" },
    ]);
    (doc as { models: Record<string, string> }).models = {
      scientist: "dup",
      judge: "dup",
      auditor: "dup",
    };
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("tab", { name: "Roles" }));
    // Scientist AND auditor overlap the judge (the save gate checks
    // every slot but judge) — two red badges.
    expect(await screen.findAllByText("Overlaps judge")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Model for scientist"), {
      target: { value: "fixed" },
    });
    fireEvent.change(screen.getByLabelText("Model for auditor"), {
      target: { value: "fixed2" },
    });
    await vi.waitFor(() => {
      expect(screen.queryByText("Overlaps judge")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as { models: Record<string, string> };
    expect(body.models).toEqual({ scientist: "fixed", judge: "dup", auditor: "fixed2" });
  });

  it("tools tab toggles enables and keeps non-registry names", async () => {
    const doc = loopMethodology([
      { id: "plan", node: "plan" },
      { id: "final_output", node: "final_output" },
    ]);
    (doc as { tools: { enabled: string[] } }).tools = {
      enabled: ["grep_project", "search_web"],
    };
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(
      await screen.findByText(/Role nodes may restrict but never expand/),
    ).toBeDefined();
    expect(screen.getByText(/Kept on save.*search_web/)).toBeDefined();
    fireEvent.click(screen.getByRole("checkbox", { name: "grep_project" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as { tools: { enabled: string[] } };
    expect(body.tools.enabled).toEqual(["search_web"]);
  });

  it("budget tab prefills from the document and saves", async () => {
    const doc = loopMethodology([
      { id: "plan", node: "plan" },
      { id: "final_output", node: "final_output" },
    ]);
    (doc as { budget_defaults: { max_model_calls: number; max_research_rounds: number } }).budget_defaults =
      { max_model_calls: 99, max_research_rounds: 9 };
    const { puts, handler } = libraryStub((url, init) => {
      if (!init?.method && url.endsWith("/api/v1/methodologies/m1")) return doc;
      return undefined;
    });
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("tab", { name: "Budget" }));
    // Non-default fixture: proves the prefill reads the document
    // instead of the useState fallbacks (which are 50/5).
    const calls = (await screen.findByLabelText(
      "Max model calls",
    )) as HTMLInputElement;
    expect(calls.value).toBe("99");
    expect(
      (screen.getByLabelText("Max research rounds") as HTMLInputElement).value,
    ).toBe("9");
    // Negatives are refused, never committed.
    fireEvent.change(calls, { target: { value: "-10" } });
    expect(calls.value).toBe("99");
    fireEvent.change(calls, { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Max research rounds"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      budget_defaults: { max_model_calls: number; max_research_rounds: number };
    };
    expect(body.budget_defaults).toEqual({ max_model_calls: 10, max_research_rounds: 2 });
  });

  it("metadata tab edits name, description, and modes through one save", async () => {
    const { puts, handler } = libraryStub();
    stubFetch(handler);
    render(<BuilderPage />);
    await screen.findByTestId("stage-card-plan");
    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    // Drive the TAB's Name input (not the header box sharing its
    // label family): the header must reflect it through shared state.
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Renamed" },
    });
    expect(
      (screen.getByLabelText("Methodology name") as HTMLInputElement).value,
    ).toBe("Renamed");
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "New desc" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "brainstorm" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    const body = puts[0].body as {
      name: string;
      description: string;
      compatible_modes: string[];
    };
    expect(body.name).toBe("Renamed");
    expect(body.description).toBe("New desc");
    expect(body.compatible_modes).toEqual(["research", "brainstorm"]);
  });
});
