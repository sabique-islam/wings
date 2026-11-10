import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIMessageContent } from "./AIMessageContent";

vi.mock("@/components/BlockEditor/CodeBlockMermaidPreview", () => ({ CodeBlockMermaidPreview: ({ source }: { source: string }) => <div data-testid="mermaid-preview">{source}</div> }));
afterEach(cleanup);

describe("rich chat messages", () => {
  it("renders Mermaid with source controls and delays incomplete streamed diagrams", () => {
    const content = "```mermaid\nflowchart LR\n A --> B\n```";
    const { rerender } = render(<AIMessageContent content={content} pending />);
    expect(screen.queryByTestId("mermaid-preview")).toBeNull();
    rerender(<AIMessageContent content={content} />);
    expect(screen.getByTestId("mermaid-preview")).toHaveTextContent("A --> B");
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.queryByTestId("mermaid-preview")).toBeNull();
    expect(document.querySelector("pre code")).toHaveTextContent("flowchart LR");
  });

  it("uses Wings math normalization and highlighting while preserving unknown code", () => {
    const content = "Inline \\(\\frac{1}{2}\\).\n\n$$\nE=mc^2\n$$\n\n```ts\nconst answer = 42;\n```\n\n```mystery\n<a>literal</a>\n```";
    const { container } = render(<AIMessageContent content={content} />);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".hljs-keyword")).toHaveTextContent("const");
    expect(container.querySelector("code.language-mystery")).toHaveTextContent("<a>literal</a>");
  });

  it("renders tables, task lists, images and media links", () => {
    const { container } = render(<AIMessageContent content={"| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] done\n\n![Chart](https://example.com/chart.png)\n\n[Listen](https://example.com/a.mp3)\n\n![Watch](https://example.com/v.webm)"} />);
    expect(container.querySelector(".ai-table-scroll table")).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("img", { name: "Chart" })).toBeTruthy();
    expect(container.querySelector("audio")).toHaveAttribute("controls");
    expect(container.querySelector("video")).toHaveAttribute("controls");
  });

  it("does not execute HTML, unsafe links or trusted KaTeX commands", () => {
    const { container } = render(<AIMessageContent content={'<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n<img src=x onerror="alert(1)">\n\n$\\href{javascript:alert(1)}{click}$'} />);
    expect(container.querySelector("script, [onerror], a[href^='javascript:'], iframe")).toBeNull();
  });

  it("displays data images without opening SVG content as an active document", () => {
    const { container } = render(<AIMessageContent content="![SVG](data:image/svg+xml;base64,PHN2Zy8+)" />);
    expect(screen.getByRole("img", { name: "SVG" })).toBeTruthy();
    expect(container.querySelector('a[href^="data:"]')).toBeNull();
  });
});
