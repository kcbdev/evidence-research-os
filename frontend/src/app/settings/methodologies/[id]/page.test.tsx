import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MethodologyEditorPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "custom-v1" }),
}));

const SAVED = {
  id: "custom-v1",
  name: "Custom",
  description: "d",
  is_default: false,
  compatible_modes: ["research"],
  workflow: { stages: [{ id: "plan", node: "plan" }] },
  tools: { enabled: [] },
  prompts: { set: "x", overrides: {} },
  skills: {},
  models: { scientist: "m", judge: "j" },
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
});

describe("MethodologyEditorPage", () => {
  it("loads YAML, saves via PUT, shows Saved on success", async () => {
    const puts: unknown[] = [];
    stubFetch((url, init) => {
      if (init?.method === "PUT") {
        puts.push(JSON.parse((init.body as string) ?? "{}"));
        return SAVED;
      }
      return SAVED;
    });
    render(<MethodologyEditorPage />);
    const area = (await screen.findByLabelText("Methodology YAML")) as HTMLTextAreaElement;
    expect(area.value).toContain("custom-v1");
    // Preview reflects the loaded stages (numbered entry).
    expect(screen.getByText(/1\. plan/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");
    expect(puts).toHaveLength(1);
  });

  it("shows 422 errors inline and persists nothing", async () => {
    // Note: client surfaces !ok as thrown Error with status text.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return { ok: false, status: 422, json: async () => ({}), text: async () => "unknown node 'nope' in stage 'a'" };
        }
        return { ok: true, status: 200, json: async () => SAVED, text: async () => "" };
      }),
    );
    render(<MethodologyEditorPage />);
    await screen.findByLabelText("Methodology YAML");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/unknown node/)).toBeDefined();
    expect(screen.queryByText("Saved.")).toBeNull();
  });
});
