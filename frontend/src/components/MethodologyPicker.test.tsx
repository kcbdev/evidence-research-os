import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MethodologyPicker from "./MethodologyPicker";

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

const ALL = [
  { id: "deep-research-council-v1", name: "Deep Research Council", description: "d", is_default: true, compatible_modes: ["research"] },
  { id: "brainstorm-ideation-v1", name: "Brainstorm Ideation", description: "d", is_default: true, compatible_modes: ["brainstorm"] },
];

describe("MethodologyPicker", () => {
  it("lists mode-compatible options plus the default", async () => {
    const onChange = vi.fn();
    stubFetch(() => ALL);
    render(<MethodologyPicker mode="research" value="" onChange={onChange} />);
    fireEvent.click(await screen.findByRole("combobox", { name: "Methodology" }));
    expect(await screen.findByText("Deep Research Council (default)")).toBeDefined();
    expect(screen.queryByText("Brainstorm Ideation")).toBeNull();
    expect(screen.getByText("Mode default")).toBeDefined();
  });

  it("degrades honestly when the registry is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    render(<MethodologyPicker mode="research" value="" onChange={() => {}} />);
    expect(await screen.findByText(/mode default/)).toBeDefined();
  });
});
