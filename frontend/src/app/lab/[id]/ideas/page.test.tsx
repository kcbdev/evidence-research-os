import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IdeasPage from "./page";

const IDEAS = [
  {
    id: "I-001",
    statement: "first angle with a long statement for truncation checks",
    novelty_check: { status: "novel", against: [] },
    proposed_experiment: {
      hypothesis: "h1",
      falsification_condition: "sterile replication shows nothing",
      feasibility: "high",
    },
    status: "under_skeptic_review",
  },
  {
    id: "I-002",
    statement: "second angle",
    novelty_check: null,
    proposed_experiment: null,
    status: "proposed",
  },
];

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p" }),
  useRouter: () => ({ push }),
}));

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => handler(url, init),
      text: async () => "",
    })),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe("IdeasPage", () => {
  it("renders columns and cards", async () => {
    stubFetch(() => IDEAS);
    render(<IdeasPage />);
    expect(await screen.findByText("first angle with a long statement for truncation checks")).toBeDefined();
    expect(screen.getByText("Under Skeptic Review")).toBeDefined();
    expect(screen.getByText("Novelty: novel")).toBeDefined();
  });

  it("shows the empty state when there are no ideas", async () => {
    stubFetch(() => []);
    render(<IdeasPage />);
    expect(await screen.findByText("No ideas yet")).toBeDefined();
    fireEvent.click(screen.getByText("Back to Overview"));
    expect(push).toHaveBeenCalledWith("/lab/p");
  });

  it("opens the detail dialog with keyboard and promotes", async () => {
    stubFetch((url, init) => {
      if (init?.method === "PATCH") {
        return { ...IDEAS[0], status: "promoted_to_claim", created_claim_id: "C-001" };
      }
      return IDEAS;
    });
    render(<IdeasPage />);
    const card = await screen.findByRole("button", { name: "Open idea I-001" });
    fireEvent.keyDown(card, { key: "Enter" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Falsification:")).toBeDefined();
    fireEvent.click(within(dialog).getByText("Promote to Claim"));
    await waitFor(() => {
      expect(screen.getByText("Claim C-001 created")).toBeDefined();
    });
  });

  it("surfaces load errors instead of the empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "boom",
      })),
    );
    render(<IdeasPage />);
    expect(await screen.findByText("Couldn’t load ideas")).toBeDefined();
  });
});
