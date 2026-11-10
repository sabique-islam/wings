import { describe, expect, it } from "vitest";
import { prepareRenderedDiagramHtml, replaceFlattenedDiagramCss } from "./diagramClipboard";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" id="chatgpt-mermaid-_r_kv_" viewBox="0 0 260 80" width="100%"><style>#chatgpt-mermaid-_r_kv_ .node{fill:#eee;stroke:#333}</style><rect class="node" width="80" height="50"/><path d="M80 25 L160 25"/><foreignObject width="80" height="50"><div xmlns="http://www.w3.org/1999/xhtml">T₁</div></foreignObject><text x="180" y="40">T₂</text></svg>';
const CSS = '#chatgpt-mermaid-_r_kv_{font-family:Arial;}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-_r_kv_ .node{fill:#eee;}T1T2T3';
const EDGE_TABLE = '| Item | Earlier operation → later operation | Edge |\n| --- | --- | --- |\n| A | `r₁(A)` → `w₂(A)` | T1 → T2 |\n| B | `r₂(B)` → `w₃(B)` | T2 → T3 |\n| C | `r₃(C)` → `w₁(C)` | T3 → T1 |';
function imageSvg(html: string): string {
  const img = new DOMParser().parseFromString(html, "text/html").querySelector("img")!;
  return new TextDecoder().decode(Uint8Array.from(atob(img.src.split(",")[1]), (character) => character.charCodeAt(0)));
}

describe("rendered diagram clipboards", () => {
  it("keeps prose and tables while storing SVG geometry and foreignObject labels in an isolated image", () => {
    const withArrow = SVG.replace('<path d="M80 25 L160 25"/>', '<defs><marker id="arrow"><path d="M0 0 L5 5 L0 10"/></marker></defs><path d="M80 25 L160 25" marker-end="url(#arrow)"/>');
    const result = prepareRenderedDiagramHtml(`<p>Before</p>${withArrow}<table><tr><td>Cell</td></tr></table><p>After</p>`)!;
    expect(result.snapshots).toBe(1);
    expect(result.html).toContain("<table>");
    expect(result.html).toContain("After");
    const decoded = imageSvg(result.html);
    expect(decoded).toContain("M80 25 L160 25");
    expect(decoded).toContain('marker-end="url(#arrow)"');
    expect(decoded).toContain('<marker id="arrow">');
    expect(decoded).toContain("foreignObject");
    expect(decoded).toContain("T₁");
    expect(decoded).toContain('width="260"');
    expect(decoded).toContain('height="80"');
    expect(result.html).not.toContain("<svg");
  });

  it("recovers provided source metadata or a matching plain-text fence as editable code", () => {
    for (const [html, text] of [
      [`<div data-mermaid-source="flowchart LR&#10;T1 --&gt; T2">${SVG}</div>`, ""],
      [SVG, "```mermaid\nflowchart LR\nT1 --> T2\n```"],
    ]) {
      const result = prepareRenderedDiagramHtml(html, text)!;
      expect(result.snapshots).toBe(0);
      const code = new DOMParser().parseFromString(result.html, "text/html").querySelector("code.language-mermaid");
      expect(code?.textContent).toBe("flowchart LR\nT1 --> T2");
    }
  });

  it("strips active content and external resources from the stored image", () => {
    const unsafe = SVG.replace("</svg>", '<script>alert(1)</script><image href="https://attacker.example/x"/><a href="javascript:alert(1)"><text>bad</text></a><style>@import "https://attacker.example/style.css";</style><rect onload="alert(1)" style="fill:url(https://attacker.example/x)"/></svg>');
    const decoded = imageSvg(prepareRenderedDiagramHtml(unsafe)!.html);
    expect(decoded).not.toMatch(/<script|onload|attacker\.example|javascript:|@import|<image/);
    expect(decoded).toContain("T₁");
  });

  it("bounds snapshots and does not turn unrelated icons into diagrams", () => {
    expect(prepareRenderedDiagramHtml("<p>plain</p><svg><path d='M0 0'/></svg>")).toBeNull();
    expect(prepareRenderedDiagramHtml('<mjx-container><svg aria-roledescription="math"><text>x²</text></svg></mjx-container>')).toBeNull();
    const result = prepareRenderedDiagramHtml(SVG.replace("</svg>", `<text>${"x".repeat(1_000_000)}</text></svg>`))!;
    expect(result.missing).toBe(1);
    expect(result.html).toContain("Diagram missing from copy");
  });

  it("replaces flattened ChatGPT diagram CSS with an honest marker without losing labels or prose", () => {
    const result = replaceFlattenedDiagramCss(`Before\n\n${CSS}\n\nConclusion`);
    expect(result.missing).toBe(1);
    expect(result.text).toContain("Diagram missing from copy");
    expect(result.text).toContain("Copied labels: T1T2T3");
    expect(result.text).toContain("Before");
    expect(result.text).toContain("Conclusion");
    expect(result.text).not.toContain("stroke-dashoffset");
    expect(result.text).not.toContain("T1 --> T2");
  });

  it("leaves explicit code samples and ordinary text unchanged", () => {
    for (const text of [`\`\`\`css\n${CSS}\n\`\`\``, `~~~css\n${CSS}\n~~~`, "T1 → T2\nConclusion", `    ${CSS}`]) {
      expect(replaceFlattenedDiagramCss(text)).toEqual({ text, missing: 0, recovered: 0 });
    }
  });

  it("preserves labels with braces instead of mistaking them for more CSS", () => {
    const text = CSS.replace("T1T2T3", "T1{input}T2{output}");
    expect(replaceFlattenedDiagramCss(text).text).toContain("Copied labels: T1{input}T2{output}");
  });

  it("rebuilds the copied transaction diagram from its preceding explicit Edge column", () => {
    for (const css of [CSS, CSS.replace(/_/g, "\\_").replace(/^#/, "\\#")]) {
      const input = `## Worked problem\n\n${EDGE_TABLE}\n\n${css}\n\n**Conclusion: not conflict serializable.**`;
      const result = replaceFlattenedDiagramCss(input);
      expect(result.recovered).toBe(1);
      expect(result.missing).toBe(0);
      expect(result.text).toContain("```mermaid\nflowchart TD\n  T1 --> T2\n  T2 --> T3\n  T3 --> T1\n```");
      expect(result.text).toContain("Diagram rebuilt from the preceding Edge column");
      expect(result.text).toContain(EDGE_TABLE);
      expect(result.text).toContain("**Conclusion: not conflict serializable.**");
      expect(result.text).not.toContain("stroke-dashoffset");
    }
  });

  it("recognizes Markdown-escaped diagram CSS even when no graph can be recovered", () => {
    const result = replaceFlattenedDiagramCss(CSS.replace(/_/g, "\\_").replace(/^#/, "\\#"));
    expect(result.missing).toBe(1);
    expect(result.text).toContain("Copied labels: T1T2T3");
    expect(result.text).not.toContain("chatgpt-mermaid");
  });

  it("does not rebuild from unrelated tables, unknown connections, or mismatched diagram labels", () => {
    for (const input of [
      EDGE_TABLE.replace("| Edge |", "| Notes |") + "\n\n" + CSS,
      EDGE_TABLE.replace("T3 → T1", "unknown") + "\n\n" + CSS,
      EDGE_TABLE + "\n\n" + CSS.replace("T1T2T3", "T1T2T3T4"),
      EDGE_TABLE + "\n\nThis table is not the following diagram.\n\n" + CSS,
    ]) {
      const result = replaceFlattenedDiagramCss(input);
      expect(result.recovered).toBe(0);
      expect(result.missing).toBe(1);
      expect(result.text).not.toContain("```mermaid");
    }
  });
});
