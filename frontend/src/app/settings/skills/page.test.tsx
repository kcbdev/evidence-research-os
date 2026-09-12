import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPage from "./page";

vi.mock("next/navigation", () => ({}));
vi.mock("@uiw/react-md-editor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (v: string) => void;
  }) => (
    <textarea
      aria-label="Skill body"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
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
    expect(screen.getByText(/Used by: Red Team/)).toBeDefined();
  });

  it("creates a skill through the dialog", async () => {
    const posted: unknown[] = [];
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/roles")) return [];
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { id: "new-skill", name: "New Skill", description: "", body: "# b" };
      }
      return [];
    });
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "New Skill" }));
    fireEvent.change(screen.getByLabelText("ID"), { target: { value: "new-skill" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Skill" } });
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# b" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(posted.length).toBe(1);
    });
    expect(posted[0]).toMatchObject({ id: "new-skill", body: "# b" });
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
