import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./page";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/v1/lab-projects")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "lp-1",
              title: "Bone Study",
              mode: "research",
              question: "does D help?",
              claims_count: 3,
            },
          ],
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

describe("Dashboard", () => {
  it("lists projects from the live API shape", async () => {
    render(<Dashboard />);
    expect(await screen.findByText("Bone Study")).toBeDefined();
    expect(screen.getByText("does D help?")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Bone Study" }).getAttribute("href"),
    ).toBe("/lab/lp-1");
  });

  it("shows the create form", async () => {
    render(<Dashboard />);
    expect(screen.getByPlaceholderText("Title")).toBeDefined();
    expect(screen.getByPlaceholderText("Research question")).toBeDefined();
    expect(
      screen.getByPlaceholderText("Judge model (OpenRouter ID, must differ)"),
    ).toBeDefined();
    await screen.findByText("Bone Study"); // settle async load
  });

  it("blocks submit without models, posts with them", async () => {
    render(<Dashboard />);
    await screen.findByText("Bone Study");
    fireEvent.change(screen.getByPlaceholderText("Title"), {
      target: { value: "T" },
    });
    fireEvent.change(screen.getByPlaceholderText("Research question"), {
      target: { value: "q" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(
      await screen.findByText(/Model selection is required/),
    ).toBeDefined();
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]) => {
        const method = (init as unknown as { method?: string } | undefined)
          ?.method;
        return method === "POST";
      }),
    ).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText(/Scientist model/), {
      target: { value: "m-sci" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Investigator model/), {
      target: { value: "m-inv" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Skeptic model/), {
      target: { value: "m-ske" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Judge model/), {
      target: { value: "m-j" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await vi.waitFor(() => {
      const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([, init]) => {
          const method = (init as unknown as { method?: string } | undefined)
            ?.method;
          return method === "POST";
        },
      );
      expect(posts.length).toBe(1);
      const [, postInit] = posts[0] as unknown as [
        unknown,
        { body: string },
      ];
      expect(JSON.parse(postInit.body)).toMatchObject({
        title: "T",
        council_models: { scientist: "m-sci", investigator: "m-inv", skeptic: "m-ske" },
        judge_model: "m-j",
      });
    });
  });
});
