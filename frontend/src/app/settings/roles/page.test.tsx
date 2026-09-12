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
    expect(posted[0].url.endsWith("/api/v1/roles")).toBe(true);
    expect(posted[0].body).toMatchObject({
      id: "blue-team",
      system_prompt: "Defend the claim.",
      tools: ["grep_project"],
      prompt_ref: null,
    });
  });

  it("edits a role through PUT", async () => {
    const puts: { url: string; body: unknown }[] = [];
    stubFetch((url, init) => {
      if (init?.method === "PUT" && url.endsWith("/api/v1/roles/red-team")) {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return { ...ROLE, name: "Red Team v2" };
      }
      return baseStub(url);
    });
    render(<RolesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const prompt = await screen.findByLabelText("System prompt");
    expect((prompt as HTMLTextAreaElement).value).toBe("Find flaws.");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Red Team v2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    expect(puts[0].url.endsWith("/api/v1/roles/red-team")).toBe(true);
    expect(puts[0].body).toMatchObject({ id: "red-team", name: "Red Team v2" });
  });

  it("promotes inline prompts to the library on save", async () => {
    const promptsPosted: unknown[] = [];
    const rolesPosted: unknown[] = [];
    const order: string[] = [];
    stubFetch((url, init) => {
      // Single-prompt read: emulate the backend 404 so promote creates.
      if (url.includes("/api/v1/prompts/") && !init?.method) {
        throw new Error("GET /prompts/blue-team-prompt: 404");
      }
      if (init?.method === "POST" && url.endsWith("/api/v1/prompts")) {
        order.push("prompts");
        promptsPosted.push(JSON.parse(String(init.body)));
        return { id: "blue-team-prompt", version: 1 };
      }
      if (init?.method === "POST" && url.endsWith("/api/v1/roles")) {
        order.push("roles");
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
    // The prompt half must land before the role that references it.
    expect(order).toEqual(["prompts", "roles"]);
    expect(promptsPosted[0]).toMatchObject({
      id: "blue-team-prompt",
      text: "Defend the claim.",
    });
    expect(rolesPosted[0]).toMatchObject({ prompt_ref: "blue-team-prompt" });
  });
});
