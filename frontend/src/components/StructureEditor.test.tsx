import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StructureEditor from "./StructureEditor";

const CLAIMS = [
  { id: "C-1", status: "SUPPORTED", confidence: 0.8, opposition: 0, statement: "first statement", consensus: { supporting_weight: 1, opposing_weight: 0, percent_support: 100 } },
  { id: "C-2", status: "SUPPORTED", confidence: 0.7, opposition: 0, statement: "second statement", consensus: { supporting_weight: 1, opposing_weight: 0, percent_support: 100 } },
];

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => handler(url.toString(), init),
      text: async () => "",
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("StructureEditor", () => {
  it("reorders claims within a section and saves the recorded order", async () => {
    const puts: unknown[] = [];
    stubFetch((url, init) => {
      if (url.includes("/output/structure") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return { sections: [{ title: "Findings", claim_ids: ["C-2", "C-1"] }] };
      }
      if (url.includes("/output/structure")) {
        return { sections: [{ title: "Findings", claim_ids: ["C-1", "C-2"] }] };
      }
      if (url.includes("/claims")) return CLAIMS;
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<StructureEditor projectId="p" />);
    expect(await screen.findByText("first statement")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Move C-1 down in Findings" }));
    fireEvent.click(screen.getByRole("button", { name: "Save structure" }));
    expect(await screen.findByText("Saved.")).toBeDefined();
    expect(puts).toEqual([
      { sections: [{ title: "Findings", claim_ids: ["C-2", "C-1"] }] },
    ]);
  });

  it("renders statements read-only with no content-editing affordance", async () => {
    stubFetch((url) => {
      if (url.includes("/output/structure")) {
        return { sections: [{ title: "Findings", claim_ids: ["C-1", "C-2"] }] };
      }
      if (url.includes("/claims")) return CLAIMS;
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<StructureEditor projectId="p" />);
    expect(await screen.findByText("first statement")).toBeDefined();
    // The only text inputs are section titles; no input/textarea is
    // ever bound to a claim statement.
    const boxes = screen.getAllByRole("textbox");
    for (const box of boxes) {
      expect((box as HTMLInputElement).value).not.toContain("statement");
    }
    expect(screen.queryByRole("textbox", { name: /C-1|statement/i })).toBeNull();
  });

  it("starts empty when no structure was recorded", async () => {
    stubFetch((url) => {
      if (url.includes("/output/structure")) return { sections: null };
      if (url.includes("/claims")) return CLAIMS;
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<StructureEditor projectId="p" />);
    const line = await screen.findByTestId("unassigned-line");
    expect(line.textContent).toContain("C-1");
    expect(line.textContent).toContain("C-2");
  });

  it("keeps title-input focus while typing (no keystroke remount)", async () => {
    stubFetch((url) => {
      if (url.includes("/output/structure")) {
        return { sections: [{ title: "Findings", claim_ids: ["C-1"] }] };
      }
      if (url.includes("/claims")) return CLAIMS;
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<StructureEditor projectId="p" />);
    const input = await screen.findByLabelText("Section 1 title");
    input.focus();
    fireEvent.change(input, { target: { value: "Findings!" } });
    fireEvent.change(input, { target: { value: "Findings!!" } });
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Findings!!");
  });

  it("moves sections and unassigns claims", async () => {
    const puts: unknown[] = [];
    stubFetch((url, init) => {
      if (url.includes("/output/structure") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return { sections: [{ title: "B", claim_ids: [] }] };
      }
      if (url.includes("/output/structure")) {
        return {
          sections: [
            { title: "A", claim_ids: ["C-1"] },
            { title: "B", claim_ids: ["C-2"] },
          ],
        };
      }
      if (url.includes("/claims")) return CLAIMS;
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<StructureEditor projectId="p" />);
    expect(await screen.findByText("first statement")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Move section A down" }));
    fireEvent.click(screen.getByRole("button", { name: "Unassign C-2 from B" }));
    fireEvent.click(screen.getByRole("button", { name: "Save structure" }));
    expect(await screen.findByText("Saved.")).toBeDefined();
    expect(puts).toEqual([
      { sections: [{ title: "B", claim_ids: [] }, { title: "A", claim_ids: ["C-1"] }] },
    ]);
  });

  it("reverts to the default order", async () => {    const puts: unknown[] = [];
    stubFetch((url, init) => {
      if (url.includes("/output/structure") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return { sections: null };
      }
      if (url.includes("/output/structure")) {
        return { sections: [{ title: "Findings", claim_ids: ["C-1"] }] };
      }
      if (url.includes("/claims")) return CLAIMS;
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<StructureEditor projectId="p" />);
    expect(await screen.findByText("first statement")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Revert to default order" }));
    expect(await screen.findByText("Saved.")).toBeDefined();
    expect(puts).toEqual([{ sections: [] }]);
    const line = await screen.findByTestId("unassigned-line");
    expect(line.textContent).toContain("C-1");
  });

  it("surfaces structure-load failures instead of showing empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes("/output/structure")) {
          throw new Error("boom");
        }
        return {
          ok: true,
          status: 200,
          json: async () => CLAIMS,
          text: async () => "",
        };
      }),
    );
    render(<StructureEditor projectId="p" />);
    expect(await screen.findByText(/Saved order could not be loaded/)).toBeDefined();
  });

  it("assigns an unassigned claim via the section select", async () => {
    const puts: unknown[] = [];
    stubFetch((url, init) => {
      if (url.includes("/output/structure") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return { sections: [{ title: "A", claim_ids: ["C-2"] }] };
      }
      if (url.includes("/output/structure")) {
        return { sections: [{ title: "A", claim_ids: [] }] };
      }
      if (url.includes("/claims")) return CLAIMS;
      throw new Error(`unexpected fetch: ${url}`);
    });
    render(<StructureEditor projectId="p" />);
    expect(await screen.findByTestId("unassigned-line")).toBeDefined();
    // Base-UI items need pointer sequence, not click alone (probed).
    fireEvent.click(screen.getByRole("combobox", { name: "Assign claim to A" }));
    const option = await screen.findByRole("option", { name: "C-2" });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);
    expect(await screen.findByText("second statement")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save structure" }));
    expect(await screen.findByText("Saved.")).toBeDefined();
    expect(puts).toEqual([
      { sections: [{ title: "A", claim_ids: ["C-2"] }] },
    ]);
  });
});
