import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "./page";

const HITS = [
  {
    project_id: "pa",
    project_title: "Alpha",
    claim_id: "C-1",
    matching_text: "microbe Y causes effect X",
    score: 0.9,
  },
  {
    project_id: "pb",
    project_title: "Beta",
    claim_id: null,
    matching_text: "unrelated excerpt",
    score: 0.2,
  },
];

vi.mock("next/navigation", () => ({}));

function stubFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => handler(url),
      text: async () => "",
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("SearchPage", () => {
  it("groups hits by project with claim deep links", async () => {
    stubFetch(() => HITS);
    render(<SearchPage />);
    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "microbe" },
    });
    fireEvent.click(screen.getByText("Search"));
    expect(await screen.findByText("Alpha")).toBeDefined();
    expect(screen.getByText("Beta")).toBeDefined();
    const link = screen.getByRole("link", { name: "Open C-1 in Alpha claims" });
    expect(link.getAttribute("href")).toBe("/lab/pa/claims?claim=C-1");
  });

  it("shows the empty state on no matches", async () => {
    stubFetch(() => []);
    render(<SearchPage />);
    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "zzz" },
    });
    fireEvent.click(screen.getByText("Search"));
    expect(await screen.findByText("No matches")).toBeDefined();
  });

  it("surfaces search errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "boom",
      })),
    );
    render(<SearchPage />);
    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByText("Search"));
    expect(await screen.findByText("Search failed")).toBeDefined();
  });
});
