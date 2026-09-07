import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Markdown from "./Markdown";

describe("Markdown", () => {
  it("renders headings, bold, code, lists, paragraphs", () => {
    render(
      <Markdown
        text={"# Title\n\nA **bold** move with `code`.\n\n## Sub\n\n- one\n- two\n\n### Deep\n\ntail"}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Title");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Sub");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Deep");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem").length).toBe(2);
    expect(screen.getByText("tail")).toBeDefined();
  });

  it("renders plain text as paragraphs", () => {
    const { container } = render(<Markdown text={"hello"} />);
    expect(container.querySelector("p")?.textContent).toBe("hello");
  });
});
