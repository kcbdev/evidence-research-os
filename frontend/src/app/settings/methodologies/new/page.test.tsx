import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewMethodologyPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe("NewMethodologyPage", () => {
  it("previews template stages and creates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ id: "my-methodology-v1" }),
        text: async () => "",
      })),
    );
    render(<NewMethodologyPage />);
    // Preview-grade stage list from the template (numbered entries).
    expect(await screen.findByText(/trigger_classifier/)).toBeDefined();
    expect(screen.getByText(/human_checkpoint/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Create methodology" }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith("/settings/methodologies/my-methodology-v1");
    });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as { method: string }).method).toBe("POST");
  });

  it("shows server validation errors inline, saves nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({}),
        text: async () => "unknown node 'nope' in stage 'a'",
      })),
    );
    render(<NewMethodologyPage />);
    fireEvent.change(screen.getByLabelText("Methodology YAML"), {
      target: { value: "id: bad\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create methodology" }));
    expect(await screen.findByText(/unknown node/)).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});
