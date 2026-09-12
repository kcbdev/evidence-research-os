import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ModelSelector from "./ModelSelector";

const MODELS = [
  { id: "deepseek/deepseek-v4-flash-0731", name: "DeepSeek Flash" },
  { id: "qwen/qwen3.5-flash-02-23", name: "Qwen Flash" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
];

function stubModels(models: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: models }),
      text: async () => "",
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function StatefulHarness({ label, initial = "" }: { label: string; initial?: string }) {
  const [value, setValue] = useState(initial);
  return <ModelSelector label={label} value={value} onChange={setValue} />;
}

describe("ModelSelector", () => {
  it("filters the live list and fills the id on select", async () => {
    stubModels(MODELS);
    render(<StatefulHarness label="Scientist model" />);
    const input = await screen.findByLabelText("Scientist model");
    fireEvent.focus(input);
    expect(await screen.findByText("DeepSeek Flash")).toBeDefined();
    fireEvent.change(input, { target: { value: "qwen" } });
    expect(screen.queryByText("DeepSeek Flash")).toBeNull();
    expect(screen.getByText("Qwen Flash")).toBeDefined();
    // Real clicks fire mousedown first (the li handles mousedown to
    // beat input blur) — fireEvent.click alone would skip it.
    fireEvent.mouseDown(screen.getByText("Qwen Flash"));
    expect((screen.getByLabelText("Scientist model") as HTMLInputElement).value).toBe(
      "qwen/qwen3.5-flash-02-23",
    );
  });

  it("keyboard-selects with arrows and Enter", async () => {
    stubModels(MODELS);
    const onChange = vi.fn();
    render(<ModelSelector label="Judge model" value="" onChange={onChange} />);
    const input = await screen.findByLabelText("Judge model");
    fireEvent.focus(input);
    await screen.findByText("DeepSeek Flash");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // Sorted by id: deepseek, meta-llama, qwen → index 2 is qwen.
    expect(onChange).toHaveBeenCalledWith("qwen/qwen3.5-flash-02-23");
  });

  it("degrades to free text when the list is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const onChange = vi.fn();
    render(<ModelSelector label="Skeptic model" value="" onChange={onChange} />);
    const input = (await screen.findByLabelText("Skeptic model")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "custom/future-model" } });
    expect(onChange).toHaveBeenCalledWith("custom/future-model");
    expect(await screen.findByText(/type any OpenRouter ID manually/)).toBeDefined();
  });

  it("degrades on non-ok responses too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "boom",
      })),
    );
    render(<ModelSelector label="Skeptic model" value="" onChange={() => {}} />);
    await screen.findByLabelText("Skeptic model");
    expect(await screen.findByText(/type any OpenRouter ID manually/)).toBeDefined();
  });

  it("reuses the 24h cache instead of refetching", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: MODELS }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const noop = () => {};
    const { unmount } = render(<ModelSelector label="A" value="" onChange={noop} />);
    fireEvent.focus(screen.getByLabelText("A"));
    await screen.findByText("DeepSeek Flash");
    unmount();
    render(<ModelSelector label="B" value="" onChange={noop} />);
    fireEvent.focus(screen.getByLabelText("B"));
    await screen.findByText("DeepSeek Flash");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
