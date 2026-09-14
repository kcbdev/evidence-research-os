import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunActivityFeed, { occurrencesFor } from "./RunActivityFeed";

const EVENTS = [{ node: "plan" }, { node: "plan" }, { node: "synthesis" }];

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes("/checkpoints/plan") && path.includes("occurrence=2")) {
        return {
          ok: true,
          json: async () => ({
            node: "plan",
            occurrence: 2,
            step: 3,
            at: "t",
            state: { lab_project_id: "p", mode: "research" },
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

describe("RunActivityFeed time travel", () => {
  it("numbers repeat executions and fetches the right occurrence", async () => {
    render(<RunActivityFeed events={EVENTS} projectId="p" runId="r" />);
    // Second plan run shows its occurrence count.
    const second = await screen.findByRole("button", {
      name: "Inspect state after plan (run 2)",
    });
    fireEvent.click(second);
    expect(
      await screen.findByText(/"lab_project_id": "p"/),
    ).toBeDefined();
    expect(screen.getByText(/"mode": "research"/)).toBeDefined();
  });

  it("computes occurrences per node in feed order", () => {
    expect(occurrencesFor(EVENTS)).toEqual([
      { node: "plan", occurrence: 1 },
      { node: "plan", occurrence: 2 },
      { node: "synthesis", occurrence: 1 },
    ]);
  });
});
