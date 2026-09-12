import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RolesPage from "./page";

vi.mock("next/navigation", () => ({}));

const ROLE = {
  id: "red-team",
  name: "Red Team",
  description: "d",
  system_prompt: "Find flaws.",
  prompt_ref: null,
  tools: [],
  model: "",
  output_schema: null,
  skills: [],
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

function baseStub(url: string) {
  if (url.includes("openrouter.ai")) return { data: [] };
  if (url.endsWith("/api/v1/roles")) return [ROLE];
  if (url.endsWith("/api/v1/prompts")) return [];
  if (url.endsWith("/api/v1/skills")) return [];
  if (url.endsWith("/api/v1/tools")) {
    return [{ name: "grep_project", description: "g", source: "backend-local" }];
  }
  if (url.endsWith("/api/v1/methodologies")) {
    return [{ id: "m1", name: "Pipe", is_default: false, compatible_modes: [] }];
  }
  if (url.endsWith("/api/v1/methodologies/m1")) {
    return { id: "m1", name: "Pipe", custom_roles: [{ id: "red-team" }] };
  }
  return [];
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("RolesPage", () => {
  it("lists roles with referencing-methodology badges", async () => {
    stubFetch(baseStub);
    render(<RolesPage />);
    expect(await screen.findByText("Red Team")).toBeDefined();
    expect(screen.getByText("Pipe")).toBeDefined();
  });

  it("saves a role with chosen tools", async () => {
    const posted: { url: string; body: unknown }[] = [];
    stubFetch((url, init) => {
      if (init?.method === "POST" && url.endsWith("/api/v1/roles")) {
        posted.push({ url, body: JSON.parse(String(init.body)) });
        return { ...ROLE };
      }
      return baseStub(url);
    });
    render(<RolesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "New Role" }));
    fireEvent.change(screen.getByLabelText("ID"), { target: { value: "blue-team" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Blue Team" } });
    fireEvent.change(screen.getByLabelText("System prompt"), {
      target: { value: "Defend the claim." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "grep_project" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(posted.length).toBe(1);
    });
    expect(posted[0].body).toMatchObject({
      id: "blue-team",
      system_prompt: "Defend the claim.",
      tools: ["grep_project"],
      prompt_ref: null,
    });
  });

  it("promotes inline prompts to the library on save", async () => {
    const promptsPosted: unknown[] = [];
    const rolesPosted: unknown[] = [];
    stubFetch((url, init) => {
      if (init?.method === "POST" && url.endsWith("/api/v1/prompts")) {
        promptsPosted.push(JSON.parse(String(init.body)));
        return { id: "blue-team-prompt", version: 1 };
      }
      if (init?.method === "POST" && url.endsWith("/api/v1/roles")) {
        rolesPosted.push(JSON.parse(String(init.body)));
        return { ...ROLE };
      }
      return baseStub(url);
    });
    render(<RolesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "New Role" }));
    fireEvent.change(screen.getByLabelText("ID"), { target: { value: "blue-team" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Blue Team" } });
    fireEvent.change(screen.getByLabelText("System prompt"), {
      target: { value: "Defend the claim." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Save as reusable prompt/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(rolesPosted.length).toBe(1);
    });
    expect(promptsPosted.length).toBe(1);
    expect(promptsPosted[0]).toMatchObject({
      id: "blue-team-prompt",
      text: "Defend the claim.",
    });
    expect(rolesPosted[0]).toMatchObject({ prompt_ref: "blue-team-prompt" });
  });
});
