import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MethodologyRedirect from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "custom-v1" }),
  useRouter: () => ({ replace }),
}));

// PBI-069: the raw-YAML editor is retired — booked [id] URLs forward
// to the builder (redirect preferred over deletion).
describe("MethodologyRedirect", () => {
  it("forwards to the builder with a fallback link", () => {
    render(<MethodologyRedirect />);
    expect(replace).toHaveBeenCalledWith(
      "/settings/methodologies/custom-v1/builder",
    );
    expect(
      screen
        .getByRole("link", { name: "Open the builder" })
        .getAttribute("href"),
    ).toBe("/settings/methodologies/custom-v1/builder");
  });
});
