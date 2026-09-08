import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LabOverview from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p" }),
  useRouter: () => ({ push }),
}));

const PROJECT = {
  id: "p",
  title: "T",
  mode: "research",
  question: "q",
  claims_count: 2,
  council_models: { scientist: "m-sci", investigator: "m-inv", skeptic: "m-ske" },
  judge_model: "m-j",
  counts: { claims: 2, evidence: 1, sources: 1, ideas: 0, tasks: 0, decisions: 0 },
};

const BUDGET = {
  max_model_calls: 50,
  max_research_rounds: 5,
  calls_used: 0,
  rounds_used: 0,
  exhausted: false,
};

const RUNS = [
  { run_id: "r2", status: "done", needs_approval: false, events_count: 14, error: null },
  { run_id: "r1", status: "awaiting_approval", needs_approval: true, events_count: 11, error: null },
];

beforeEach(() => {
  push.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const path = String(url);
      if (path.endsWith("/budget")) {
        return { ok: true, json: async () => BUDGET };
      }
      if (path.endsWith("/output/report")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (path.endsWith("/p/runs") && init?.method === "POST") {
        return { ok: true, json: async () => ({ run_id: "r9", status: "running" }) };
      }
      if (path.endsWith("/p/runs")) {
        return { ok: true, json: async () => RUNS };
      }
      if (path.endsWith("/lab-projects/p") && init?.method === "PATCH") {
        const body = JSON.parse(init.body as string);
        if (body.judge_model === body.council_models?.scientist) {
          return {
            ok: false,
            status: 400,
            json: async () => ({}),
            text: async () => "self-preference overlap",
          };
        }
        return { ok: true, json: async () => ({ ...PROJECT, ...body }) };
      }
      if (path.endsWith("/lab-projects/p")) {
        return { ok: true, json: async () => PROJECT };
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }),
  );
});

describe("LabOverview", () => {
  it("shows counted tabs and runs history with links", async () => {
    render(<LabOverview />);
    expect(await screen.findByRole("tab", { name: "Claims (2)" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Runs (2)" })).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "Runs (2)" }));
    expect(await screen.findByText("r2")).toBeDefined();
    expect(screen.getByText("needs approval")).toBeDefined();
    expect(screen.getByRole("link", { name: "r1" }).getAttribute("href")).toBe(
      "/lab/p/runs/r1",
    );
  });

  it("start button posts and navigates to the run view", async () => {
    render(<LabOverview />);
    fireEvent.click(await screen.findByRole("tab", { name: "Runs (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith("/lab/p/runs/r9");
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/lab-projects/p/runs"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("settings tab prefills, saves, and surfaces refusal", async () => {
    render(<LabOverview />);
    fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
    const judge = screen.getByPlaceholderText(
      "Judge model (must differ)",
    ) as HTMLInputElement;
    expect(judge.value).toBe("m-j");

    fireEvent.click(screen.getByRole("button", { name: "Save models" }));
    expect(await screen.findByText("Saved.")).toBeDefined();
    const patches = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith("/lab-projects/p") &&
        (init as unknown as { method?: string } | undefined)?.method ===
          "PATCH",
    );
    expect(patches.length).toBe(1);
    expect(
      JSON.parse(
        (patches[0][1] as unknown as { body: string }).body,
      ),
    ).toMatchObject({ judge_model: "m-j" });

    fireEvent.change(judge, { target: { value: "m-sci" } });
    fireEvent.click(screen.getByRole("button", { name: "Save models" }));
    expect(await screen.findByText(/self-preference/)).toBeDefined();
  });
});
