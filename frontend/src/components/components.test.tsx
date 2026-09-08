import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClaimConfidenceBar from "./ClaimConfidenceBar";
import ContradictionBadge from "./ContradictionBadge";

const CONF = {
  source_quality: 0.9,
  methodological_strength: 0.8,
  independent_confirmation: 0.7,
  contradiction_level: 0.1,
  overall: 0.82,
};

describe("ClaimConfidenceBar", () => {
  it("renders all five dimensions, never a single number", () => {
    const { container } = render(<ClaimConfidenceBar confidence={CONF} />);
    for (const label of [
      "Source quality",
      "Method strength",
      "Confirmation",
      "Contradiction",
      "Overall",
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(container.textContent).toContain("0.82");
  });

  it("renders unscored for null confidence", () => {
    render(<ClaimConfidenceBar confidence={null} />);
    expect(screen.getByText("unscored")).toBeDefined();
  });
});

describe("ContradictionBadge", () => {
  it("renders nothing without opposition", () => {
    const { container } = render(
      <ContradictionBadge opposition={0} claimId="C-1" onOpen={() => {}} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders a button opening the trace modal", () => {
    const onOpen = vi.fn();
    render(
      <ContradictionBadge opposition={2} claimId="C-9" onOpen={onOpen} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /2 opposing/ }));
    expect(onOpen).toHaveBeenCalledWith("C-9");
  });
});
