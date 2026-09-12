import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PromptsPage from "./page";

vi.mock("next/navigation", () => ({}));

const PROMPT = {
  id: "skeptic-v1",
  name: "Skeptic",
  description: "d",
  text: "Attack harder.",
  version: 2,
  updated_at: "2026-09-12T00:00:00+00:00",
  history: [],
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

describe("PromptsPage", () => {
  it("lists prompts with used-by counts", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/v1/roles")) {
        return [{ ...{ id: "r", name: "R" }, prompt_ref: "skeptic-v1" }];
      }
      return [PROMPT];
    });
    render(<PromptsPage />);
    expect(await screen.findByText("Skeptic")).toBeDefined();
    expect(screen.getByText("1 role")).toBeDefined();
  });

  it("re-saving mints a version and revert restores old text", async () => {
    const puts: { url: string; body: unknown }[] = [];
    let text = "Attack harder.";
    let versionsHits = 0;
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/roles")) return [];
      if (url.endsWith("/versions")) {
        versionsHits += 1;
        return [
          { version: 1, text: "Attack this claim.", saved_at: "t1" },
          { version: versionsHits > 1 ? 3 : 2, text, saved_at: "t2" },
        ];
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { text: string };
        puts.push({ url, body });
        text = body.text;
        return { ...PROMPT, text, version: 3 };
      }
      return [{ ...PROMPT, text }];
    });
    render(<PromptsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByText(/Version 1/)).toBeDefined();
    // The Revert action lives inside the collapsed version panel —
    // expand it first, exactly as a user must.
    fireEvent.click(screen.getByRole("button", { name: /Version 1/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Revert to this version" }),
    );
    await vi.waitFor(() => {
      expect(puts.length).toBe(1);
    });
    expect(puts[0].url.endsWith("/api/v1/prompts/skeptic-v1")).toBe(true);
    expect(puts[0].body).toMatchObject({ text: "Attack this claim." });
    // The revert persists AND refreshes: textarea shows v1 text and the
    // version list was re-fetched (current marker moves to version 3).
    await vi.waitFor(() => {
      expect(versionsHits).toBe(2);
    });
    expect((screen.getByLabelText("Prompt text") as HTMLTextAreaElement).value).toBe(
      "Attack this claim.",
    );
    expect(await screen.findByText(/Version 3 \(current\)/)).toBeDefined();
  });

  it("saves a new prompt through POST without client versioning", async () => {
    const posts: { url: string; body: unknown }[] = [];
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/roles")) return [];
      if (url.endsWith("/api/v1/prompts") && init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return { ...PROMPT, id: "fresh", version: 1 };
      }
      if (url.includes("/api/v1/prompts/")) {
        throw new Error("404"); // getPrompt: id is free
      }
      return [];
    });
    render(<PromptsPage />);
    await screen.findByRole("button", { name: "New Prompt" });
    fireEvent.click(screen.getByRole("button", { name: "New Prompt" }));
    fireEvent.change(screen.getByLabelText("ID"), { target: { value: "fresh" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fresh" } });
    fireEvent.change(screen.getByLabelText("Prompt text"), {
      target: { value: "Be fresh." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => {
      expect(posts.length).toBe(1);
    });
    expect(posts[0].url.endsWith("/api/v1/prompts")).toBe(true);
    expect(posts[0].body).toMatchObject({ id: "fresh", text: "Be fresh." });
    expect(posts[0].body).not.toHaveProperty("version");
  });

  it("refuses a duplicate id on new instead of clobbering", async () => {
    const posts: unknown[] = [];
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/roles")) return [];
      if (url.endsWith("/api/v1/prompts/skeptic-v1")) return PROMPT;
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return PROMPT;
      }
      return [];
    });
    render(<PromptsPage />);
    await screen.findByRole("button", { name: "New Prompt" });
    fireEvent.click(screen.getByRole("button", { name: "New Prompt" }));
    fireEvent.change(screen.getByLabelText("ID"), { target: { value: "skeptic-v1" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Prompt text"), { target: { value: "Y" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/already exists/)).toBeDefined();
    expect(posts.length).toBe(0);
  });

  it("surfaces load errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    render(<PromptsPage />);
    expect(await screen.findByText("Something went wrong")).toBeDefined();
  });
});
