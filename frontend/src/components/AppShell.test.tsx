import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("renders brand, breadcrumb trail, and children", () => {
    render(
      <AppShell
        trail={[
          { href: "/lab/p", label: "Lab" },
          { href: "/lab/p/claims", label: "Claims" },
        ]}
      >
        <p>page body</p>
      </AppShell>,
    );
    expect(
      screen.getByRole("link", { name: "Evidence Research OS" }).getAttribute(
        "href",
      ),
    ).toBe("/");
    expect(screen.getByText("page body")).toBeDefined();
    expect(screen.getByText("Lab")).toBeDefined();
    const current = screen.getByText("Claims");
    expect(current.getAttribute("aria-current")).toBe("page");
  });
});
