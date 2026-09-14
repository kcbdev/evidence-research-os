import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ConsensusMeter from "./ConsensusMeter";

describe("ConsensusMeter", () => {
  it("splits the bar by percent_support", () => {
    const { container } = render(
      <ConsensusMeter
        consensus={{ supporting_weight: 6, opposing_weight: 2, percent_support: 75.0 }}
      />,
    );
    const meter = screen.getByRole("img", { name: /Consensus 75\.0% supporting/ });
    expect(meter).toBeDefined();
    const bars = container.querySelectorAll("div.bg-emerald-500, div.bg-amber-500");
    expect(bars).toHaveLength(2);
    expect((bars[0] as HTMLElement).style.width).toBe("75%");
    expect((bars[1] as HTMLElement).style.width).toBe("25%");
    expect(screen.getByText("75.0% supporting")).toBeDefined();
  });

  it("shows the absence instead of a fake split when weightless", () => {
    render(
      <ConsensusMeter
        consensus={{ supporting_weight: 0, opposing_weight: 0, percent_support: null }}
      />,
    );
    expect(screen.getByText("no weighted sources")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
