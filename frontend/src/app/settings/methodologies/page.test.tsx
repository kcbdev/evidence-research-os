import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MethodologiesPage from "./page";

const ITEMS = [
  { id: "deep-research-council-v1", name: "Deep Research Council", description: "d", is_default: true, compatible_modes: ["research"] },
  { id: "custom-v1", name: "Custom", description: "d", is_default: false, compatible_modes: ["research"] },
];

vi.mock("next/navigation", () => ({}));

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

describe("MethodologiesPage", () => {
  it("lists with default badges and confirms set-default", async () => {
    let defaulted = "deep-research-council-v1";
    stubFetch((url, init) => {
      if (url.endsWith("/set-default")) {
        defaulted = "custom-v1";
        return { default: "custom-v1" };
      }
      return ITEMS.map((m) => ({ ...m, is_default: m.id === defaulted }));
    });
    render(<MethodologiesPage />);
    expect(await screen.findByText("Deep Research Council")).toBeDefined();
    expect(screen.getByText("default")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Set as default" }));
    expect(await screen.findByText(/Future runs without/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Confirm default" }));
    await vi.waitFor(() => {
      const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([u]) => String(u).includes("/custom-v1/set-default"),
      );
      expect(posts.length).toBe(1);
    });
  });

  it("surfaces load errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    render(<MethodologiesPage />);
    expect(await screen.findByText("Something went wrong")).toBeDefined();
  });
});
