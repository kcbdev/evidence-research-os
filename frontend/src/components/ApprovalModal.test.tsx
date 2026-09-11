import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApprovalModal from "./ApprovalModal";
import EvidenceTraceModal from "./EvidenceTraceModal";

const CLAIMS = [
  { id: "C-1", status: "SUPPORTED", confidence: 0.9, opposition: 0, statement: "s1" },
  { id: "C-2", status: "DISPUTED", confidence: 0.3, opposition: 1, statement: "s2" },
];

const PROJECT = {
  id: "p",
  title: "T",
  mode: "research",
  question: "q",
  claims_count: 2,
  counts: { claims: 2, evidence: 5, sources: 3, ideas: 0, tasks: 0, decisions: 0 },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/claims")) {
        return { ok: true, json: async () => CLAIMS };
      }
      if (path.endsWith("/lab-projects/p")) {
        return {
          ok: true,
          json: async () => ({
            id: "p",
            counts: { evidence: 5, sources: 3 },
          }),
        };
      }
      if (path.endsWith("/approve")) {
        return { ok: true, json: async () => ({ run_id: "r", status: "running" }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
});

describe("ApprovalModal dossier", () => {
  it("renders claims-by-status counts and the claims-table link", async () => {
    render(
      <ApprovalModal projectId="p" runId="r" onResolved={() => {}} />,
    );
    expect(await screen.findByText("Total claims")).toBeDefined();
    expect(screen.getByText("SUPPORTED")).toBeDefined();
    expect(screen.getByText("DISPUTED")).toBeDefined();
    expect(screen.getByText(/5 · 3/)).toBeDefined();
    expect(screen.getByText("2", { selector: "dd" }) || null).toBeDefined();
    expect(screen.getByText(/5 · 3/)).toBeDefined();
    const link = screen.getByRole("link", { name: /Inspect the claims table/ });
    expect(link.getAttribute("href")).toBe("/lab/p/claims");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getByText(/publishes/)).toBeDefined();
    expect(screen.getByText(/nothing is published/)).toBeDefined();
  });

  it("reject posts decision plus note", async () => {
    const onResolved = vi.fn();
    render(<ApprovalModal projectId="p" runId="r" onResolved={onResolved} />);
    fireEvent.change(screen.getByLabelText("Approval note"), {
      target: { value: "too hasty" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await vi.waitFor(() => {
      expect(onResolved).toHaveBeenCalledWith("reject");
    });
    const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => String(url).endsWith("/approve"),
    );
    expect(JSON.parse(posts[0][1].body as string)).toMatchObject({
      decision: "reject",
      note: "too hasty",
    });
  });

  it("edit loads the draft and continues with edited content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.endsWith("/claims")) {
          return { ok: true, json: async () => CLAIMS };
        }
        if (path.endsWith("/lab-projects/p")) {
          return { ok: true, json: async () => PROJECT };
        }
        if (path.endsWith("/output/report")) {
          return {
            ok: true,
            json: async () => ({ markdown: "# T\n\ndraft\n", generated_at: "t" }),
          };
        }
        if (path.endsWith("/approve")) {
          return { ok: true, json: async () => ({ run_id: "r", status: "running" }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const onResolved = vi.fn();
    render(<ApprovalModal projectId="p" runId="r" onResolved={onResolved} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit draft…" }));
    const area = (await screen.findByLabelText("Synthesis draft")) as HTMLTextAreaElement;
    expect(area.value).toContain("# T");
    fireEvent.change(area, { target: { value: "# T\n\nrewritten\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
    await vi.waitFor(() => {
      expect(onResolved).toHaveBeenCalledWith("edit");
    });
    const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => String(url).endsWith("/approve"),
    );
    expect(JSON.parse(posts[0][1].body as string)).toMatchObject({
      decision: "edit",
      edited_content: "# T\n\nrewritten\n",
    });
  });

  it("edit with an emptied draft posts nothing and errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.endsWith("/output/report")) {
          return {
            ok: true,
            json: async () => ({ markdown: "# T\n", generated_at: "t" }),
          };
        }
        if (path.endsWith("/claims")) {
          return { ok: true, json: async () => [] };
        }
        if (path.endsWith("/lab-projects/p")) {
          return { ok: true, json: async () => ({ counts: {} }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const onResolved = vi.fn();
    render(<ApprovalModal projectId="p" runId="r" onResolved={onResolved} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit draft…" }));
    const area = await screen.findByLabelText("Synthesis draft");
    fireEvent.change(area, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
    expect(await screen.findByText(/empty/)).toBeDefined();
    expect(onResolved).not.toHaveBeenCalled();
    const posts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => String(url).endsWith("/approve"),
    );
    expect(posts).toHaveLength(0);
  });
});

  it("dossier failure never blocks the buttons", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    render(<ApprovalModal projectId="p" runId="r" onResolved={() => {}} />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(approve.hasAttribute("disabled")).toBe(false);
    expect(
      screen.getByRole("button", { name: "Reject" }).hasAttribute("disabled"),
    ).toBe(false);
  });
describe("modal dark treatment", () => {
  it("approval panel is token-driven (no hardcoded dark slab)", async () => {
    render(
      <div className="dark">
        <ApprovalModal projectId="p" runId="r" onResolved={() => {}} />
      </div>,
    );
    await screen.findByRole("dialog");
    const panel = document.querySelector("div.bg-popover");
    expect(panel).not.toBeNull();
    expect(panel?.className).not.toContain("bg-white");
  });

  it("trace panel is token-driven (no hardcoded dark slab)", async () => {
    render(
      <div className="dark">
        <EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />
      </div>,
    );
    const dialog = await screen.findByRole("dialog");
    const panel = dialog.parentElement?.querySelector("div.bg-popover");
    expect(panel).not.toBeNull();
    expect(panel?.className).not.toContain("bg-white");
  });
});
