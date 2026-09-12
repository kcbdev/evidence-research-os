import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewLabPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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
  push.mockClear();
});

function fillValid() {
  fireEvent.change(screen.getByLabelText("Project title"), { target: { value: "T" } });
  fireEvent.change(screen.getByLabelText("Initial question"), { target: { value: "q" } });
  for (const role of ["Scientist", "Investigator", "Skeptic", "Ideator", "Judge"]) {
    fireEvent.change(screen.getByLabelText(`${role} model`), { target: { value: `m-${role}` } });
  }
}

describe("NewLabPage", () => {
  it("creates and lands on the overview", async () => {
    stubFetch((url) => {
      if (url.endsWith("/api/v1/lab-projects")) return { id: "p1" };
      throw new Error(`unexpected: ${url}`);
    });
    render(<NewLabPage />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith("/lab/p1");
    });
  });

  it("create-and-start passes mode and budget then lands on run detail", async () => {
    let startBody: unknown = null;
    stubFetch((url, init) => {
      if (url.endsWith("/api/v1/lab-projects")) return { id: "p1" };
      if (url.endsWith("/p1/runs")) {
        startBody = JSON.parse((init?.body as string) ?? "{}");
        return { run_id: "r1", status: "running" };
      }
      throw new Error(`unexpected: ${url}`);
    });
    render(<NewLabPage />);
    fillValid();
    fireEvent.click(screen.getByRole("radio", { name: "brainstorm" }));
    fireEvent.click(screen.getByText("Advanced: budget"));
    fireEvent.change(screen.getByLabelText("Max model calls"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and start run" }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith("/lab/p1/runs/r1");
    });
    expect(startBody).toMatchObject({ mode: "brainstorm", budget: { max_model_calls: 30 } });
  });

  it("blocks create when a model is cleared", async () => {
    stubFetch(() => {
      throw new Error("must not post");
    });
    render(<NewLabPage />);
    fireEvent.change(screen.getByLabelText("Project title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Initial question"), { target: { value: "q" } });
    // Defaults prefill all roles (spec) — clearing one re-arms the guard.
    fireEvent.change(screen.getByLabelText("Judge model"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(/Model selection is required/)).toBeDefined();
  });
});
