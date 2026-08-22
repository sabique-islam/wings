import { describe, expect, it } from "vitest";
import {
  extractMathHtmlFromClipboard,
  looksLikeLatex,
  looksLikeMathMarkdown,
  normalizeMathMarkdown,
  restoreChatGptLatexEscapes,
} from "./normalizeMath";

export const CHATGPT_INTEGRATION_PASTE = `If you mean an integration-by-parts equation:

[
\\boxed{\\int u,dv = uv-\\int v,du}
]

Example:

[
\\int x e^x,dx = xe^x-\\int e^x,dx = e^x(x-1)+C
]
`;

describe("looksLikeLatex", () => {
  it("accepts TeX commands", () => {
    expect(looksLikeLatex("\\boxed{\\int u}")).toBe(true);
    expect(looksLikeLatex("\\begin{align} a &= b \\end{align}")).toBe(true);
  });

  it("rejects markdown links, wiki, citations, and lists", () => {
    expect(looksLikeLatex("link text")).toBe(false);
    expect(looksLikeLatex("1")).toBe(false);
    expect(looksLikeLatex("item one\nitem two")).toBe(false);
  });
});

describe("restoreChatGptLatexEscapes", () => {
  it("restores thin space before a differential", () => {
    expect(restoreChatGptLatexEscapes("\\int u,dv")).toBe("\\int u\\,dv");
    expect(restoreChatGptLatexEscapes("e^x,dx")).toBe("e^x\\,dx");
  });

  it("does not double-restore or touch other commas", () => {
    expect(restoreChatGptLatexEscapes("\\int u\\,dv")).toBe("\\int u\\,dv");
    expect(restoreChatGptLatexEscapes("\\int_0,1 x")).toBe("\\int_0,1 x");
  });
});

describe("normalizeMathMarkdown", () => {
  it("converts the ChatGPT integration-by-parts dump into $$ blocks", () => {
    const out = normalizeMathMarkdown(CHATGPT_INTEGRATION_PASTE);
    expect(out).toContain("If you mean an integration-by-parts equation:");
    expect(out).toContain("Example:");
    const blocks = [...out.matchAll(/\$\$\n([\s\S]+?)\n\$\$/g)].map((m) => m[1]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("\\boxed{");
    expect(blocks[0]).toContain("\\int u\\,dv");
    expect(blocks[1]).toContain("e^x\\,dx");
    expect(blocks[1]).toContain("e^x(x-1)+C");
  });

  it("converts \\( \\) and \\[ \\] mixed with prose", () => {
    const out = normalizeMathMarkdown(
      "Euler said \\(e^{i\\pi}+1=0\\) and then\n\\[\n\\int_0^1 x\\,dx = \\tfrac{1}{2}\n\\]\n",
    );
    expect(out).toContain("$e^{i\\pi}+1=0$");
    expect(out).toContain("$$\n\\int_0^1 x\\,dx = \\tfrac{1}{2}\n$$");
  });

  it("wraps align environments that are not already in $$", () => {
    const out = normalizeMathMarkdown("\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}");
    expect(out).toContain("$$\n\\begin{align}");
    expect(out).toContain("\\end{align}\n$$");
  });

  it("does not wrap an environment already inside $$", () => {
    const src = "$$\n\\begin{align}\na &= b\n\\end{align}\n$$";
    expect(normalizeMathMarkdown(src).trim()).toBe(src);
  });

  it("does not turn markdown links, wiki, or citations into math", () => {
    const src = "See [the proof](https://example.com) and [[Wiki]] and footnote [1].";
    expect(normalizeMathMarkdown(src)).toBe(src);
  });

  it("leaves generic code fences alone", () => {
    const src = "```js\nconst x = [1, 2];\nconsole.log('\\int');\n```";
    expect(normalizeMathMarkdown(src)).toBe(src);
  });

  it("converts a math fence to $$", () => {
    const out = normalizeMathMarkdown("```math\n\\int x dx\n```");
    expect(out).toContain("$$\n\\int x dx\n$$");
    expect(out).not.toContain("```math");
  });

  it("leaves a full LaTeX document fence as code", () => {
    const src = "```latex\n\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n```";
    expect(normalizeMathMarkdown(src)).toBe(src);
  });

  it("is a no-op on ordinary prose", () => {
    expect(normalizeMathMarkdown("just a sentence")).toBe("just a sentence");
  });

  it("converts a one-line ChatGPT bracket dump", () => {
    const out = normalizeMathMarkdown("[ \\int x dx ]");
    expect(out).toContain("$$\n\\int x dx\n$$");
  });
});

describe("looksLikeMathMarkdown", () => {
  it("detects the ChatGPT dump and standard delimiters", () => {
    expect(looksLikeMathMarkdown(CHATGPT_INTEGRATION_PASTE)).toBe(true);
    expect(looksLikeMathMarkdown("\\(a^2\\)")).toBe(true);
    expect(looksLikeMathMarkdown("$$x$$")).toBe(true);
    expect(looksLikeMathMarkdown("$x^2$ is nice")).toBe(true);
  });

  it("does not treat currency or plain notes as math", () => {
    expect(looksLikeMathMarkdown("I spent $20 on lunch")).toBe(false);
    expect(looksLikeMathMarkdown("See [the proof](https://example.com)")).toBe(false);
    expect(looksLikeMathMarkdown("hello world")).toBe(false);
  });
});

describe("extractMathHtmlFromClipboard", () => {
  it("pulls TeX out of a KaTeX display annotation", () => {
    const html = `<span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">\\int x\\,dx</annotation></semantics></math></span></span></span>`;
    const out = extractMathHtmlFromClipboard(html);
    expect(out).toContain('data-type="block-math"');
    expect(out).toContain("\\int x\\,dx");
  });

  it("pulls MathJax v2 script tags", () => {
    const html = `<p>See <script type="math/tex">e^{i\\pi}</script></p>`;
    const out = extractMathHtmlFromClipboard(html);
    expect(out).toContain('data-type="inline-math"');
    expect(out).toContain("e^{i\\pi}");
  });

  it("returns null when there is no extractable math", () => {
    expect(extractMathHtmlFromClipboard("<p>hello</p>")).toBeNull();
  });
});
