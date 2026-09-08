import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApprovalModal from "./ApprovalModal";
import EvidenceTraceModal from "./EvidenceTraceModal";

const CLAIMS = [
  { id: "C-1", status: "SUPPORTED", confidence: 0.9, opposition: 0, statement: "s1" },
  { id: "C-2", status: "DISPUTED", confidence: 0.3, opposition: 1, statement: "s2" },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/claims")) {
        return { ok: true, json: async () => CLAIMS };
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
    const link = screen.getByRole("link", { name: /Inspect the claims table/ });
    expect(link.getAttribute("href")).toBe("/lab/p/claims");
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
});

describe("modal dark treatment", () => {
  it("approval panel carries dark classes", () => {
    const { container } = render(
      <div className="dark">
        <ApprovalModal projectId="p" runId="r" onResolved={() => {}} />
      </div>,
    );
    const panel = container.querySelector('[role="dialog"] > div');
    expect(panel?.className).toContain("dark:bg-zinc-900");
    expect(panel?.className).toContain("dark:text-zinc-100");
  });

  it("trace panel carries dark classes", () => {
    const { container } = render(
      <div className="dark">
        <EvidenceTraceModal projectId="p" claimId="C-1" onClose={() => {}} />
      </div>,
    );
    const panel = container.querySelector('[role="dialog"] > div');
    expect(panel?.className).toContain("dark:bg-zinc-900");
    expect(panel?.className).toContain("dark:text-zinc-100");
  });
});
