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
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/roles")) return [];
      if (url.endsWith("/versions")) {
        return [
          { version: 1, text: "Attack this claim.", saved_at: "t1" },
          { version: 2, text, saved_at: "t2" },
        ];
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { text: string };
        puts.push({ url, body });
        text = body.text;
        return { ...PROMPT, text };
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
    expect(puts[0].body).toMatchObject({ text: "Attack this claim." });
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
