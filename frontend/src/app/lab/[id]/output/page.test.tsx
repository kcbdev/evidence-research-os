import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OutputPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p" }),
  useRouter: () => ({ push: vi.fn() }),
}));

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

describe("OutputPage", () => {
  it("renders the report with TOC and promotes a note", async () => {
    stubFetch((url, init) => {
      if (url.includes("/product-notes")) {
        return { id: "N-001", lab_project_id: "p", note: "ship it", linked_area: "runfusion", created_at: "t" };
      }
      return { markdown: "# Title\n\n## Findings\n\nbody text", generated_at: "2026-09-10T00:00:00Z" };
    });
    render(<OutputPage />);
    expect(await screen.findByText("Final report")).toBeDefined();
    const toc = screen.getByRole("navigation", { name: "Table of contents" });
    expect(within(toc).getByText("Findings")).toBeDefined(); // TOC entry
    fireEvent.change(screen.getByLabelText("Product note"), { target: { value: "ship it" } });
    fireEvent.change(screen.getByLabelText("Linked area"), { target: { value: "runfusion" } });
    fireEvent.click(screen.getByRole("button", { name: "Promote to product" }));
    expect(await screen.findByText("Note N-001 recorded")).toBeDefined();
  });

  it("shows the empty state before synthesis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => "no report yet",
      })),
    );
    render(<OutputPage />);
    expect(await screen.findByText("No report yet")).toBeDefined();
  });
});
