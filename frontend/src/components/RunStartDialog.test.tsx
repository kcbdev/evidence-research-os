import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunStartDialog from "./RunStartDialog";

let bodies: unknown[];

beforeEach(() => {
  bodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ run_id: "r-1", status: "running", methodology_id: "m" }) };
    }),
  );
});

describe("RunStartDialog search scope", () => {
  it("posts the default scope without interaction", async () => {
    const started: string[] = [];
    render(
      <RunStartDialog
        projectId="p"
        defaultQuestion="q"
        defaultMode="research"
        methodologyPicker={<div />}
        onStarted={(id) => started.push(id)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("Starting…");
    expect(started).toEqual(["r-1"]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ search_scope: "open_web" });
  });

  it("posts the chosen scope after a Select change", async () => {
    const started: string[] = [];
    render(
      <RunStartDialog
        projectId="p"
        defaultQuestion="q"
        defaultMode="research"
        methodologyPicker={<div />}
        onStarted={(id) => started.push(id)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    // Base-UI items need pointer sequence, not click alone (probed).
    fireEvent.click(screen.getByRole("combobox", { name: "Search scope" }));
    const option = await screen.findByRole("option", { name: "peer_reviewed_only" });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("Starting…");
    expect(started).toEqual(["r-1"]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ search_scope: "peer_reviewed_only" });
  });
});
