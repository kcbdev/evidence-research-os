import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPage from "./page";

vi.mock("next/navigation", () => ({}));
vi.mock("@uiw/react-md-editor", () => ({
  // Pass-through mock: production labels via aria-labelledby, so the
  // test proves the real label linkage instead of a mock-invented one.
  default: ({
    value,
    onChange,
    ...rest
  }: {
    value?: string;
    onChange?: (v: string) => void;
    [k: string]: unknown;
  }) => (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      {...rest}
    />
  ),
}));

const SKILLS = [
  { id: "lit-review", name: "Lit Review", description: "d", body: "# steps" },
];
const ROLES = [
  {
    id: "red-team",
    name: "Red Team",
    description: "d",
    system_prompt: "x",
    prompt_ref: null,
    tools: [],
    model: "",
    output_schema: null,
    skills: ["lit-review"],
  },
];

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

describe("SkillsPage", () => {
  it("lists skills with their using roles", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/v1/roles")) return ROLES;
      return SKILLS;
    });
    render(<SkillsPage />);
    expect(await screen.findByText("Lit Review")).toBeDefined();
    expect(screen.getByText(/Used by library roles: Red Team/)).toBeDefined();
  });

  it("creates a skill through the dialog", async () => {
    const posts: { url: string; body: unknown }[] = [];
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/roles")) return [];
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return { id: "new-skill", name: "New Skill", description: "", body: "# b" };
      }
      return [];
    });
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "New Skill" }));
    fireEvent.change(screen.getByLabelText("ID"), { target: { value: "new-skill" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Skill" } });
    fireEvent.change(screen.getByLabelText("Body (markdown)"), { target: { value: "# b" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(posts.length).toBe(1);
    });
    expect(posts[0].url.endsWith("/api/v1/skills")).toBe(true);
    expect(posts[0].body).toMatchObject({ id: "new-skill", body: "# b" });
  });

  it("edits a skill through PUT", async () => {
    const puts: { url: string; body: unknown }[] = [];
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/roles")) return [];
      if (init?.method === "PUT") {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return { ...SKILLS[0], name: "Lit Review v2" };
      }
      return SKILLS;
    });
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByLabelText("Body (markdown)")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Lit Review v2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    expect(puts[0].url.endsWith("/api/v1/skills/lit-review")).toBe(true);
    expect(puts[0].body).toMatchObject({ id: "lit-review", name: "Lit Review v2" });
  });

  it("surfaces load errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    render(<SkillsPage />);
    expect(await screen.findByText("Something went wrong")).toBeDefined();
  });
});
