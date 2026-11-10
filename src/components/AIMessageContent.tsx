import { createElement, memo, useMemo, useState, type ReactNode } from "react";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { markdownToHtml } from "@/lib/markdown";
import { CodeBlockMermaidPreview } from "@/components/BlockEditor/CodeBlockMermaidPreview";
import { codeBlockLowlight, normalizeCodeLanguage } from "@/components/BlockEditor/codeLanguages";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

function downloadSource(source: string, language: string) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `chat.${language === "mermaid" ? "mmd" : language === "plaintext" ? "txt" : language.replace(/[^a-z0-9]/g, "") || "txt"}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type HighlightNode = { type: string; value?: string; tagName?: string; properties?: { className?: string[] }; children?: HighlightNode[] };
function highlightNode(node: HighlightNode, key: number): ReactNode {
  if (node.type === "text") return node.value;
  return <span key={key} className={node.properties?.className?.join(" ")}>{node.children?.map(highlightNode)}</span>;
}

function ChatCodeBlock({ source, language, pending }: { source: string; language: string; pending: boolean }) {
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isDiagram = language === "mermaid";
  const highlighted = useMemo(() => {
    if (!codeBlockLowlight.registered(language) || source.length > 50_000) return source;
    try { return codeBlockLowlight.highlight(language, source).children.map(highlightNode); }
    catch { return source; }
  }, [language, source]);
  return (
    <section className="ai-code-block" aria-label={isDiagram ? "Mermaid diagram" : `${language} code`}>
      <div className="ai-code-toolbar">
        <span>{isDiagram ? "Mermaid" : language}</span>
        <div className="flex items-center gap-2">
          {isDiagram && <button type="button" aria-pressed={showSource} onClick={() => setShowSource(!showSource)}>{showSource ? "Preview" : "Source"}</button>}
          {isDiagram && !pending && <button type="button" onClick={() => setExpanded(true)}>Expand</button>}
          <button type="button" onClick={() => downloadSource(source, language)}>Download</button>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(source).then(() => toast.success("Copied code"), () => toast.error("Could not copy code")); }}>Copy</button>
        </div>
      </div>
      {isDiagram && !showSource ? (
        pending ? <p className="p-3 text-muted-foreground">Diagram preview appears when the answer finishes.</p> : (
          <>
            <CodeBlockMermaidPreview source={source} />
            <details className="px-3 pb-2"><summary>Diagram source</summary><pre><code>{source}</code></pre></details>
          </>
        )
      ) : <pre><code className={`language-${language}`}>{highlighted}</code></pre>}
      {expanded && <Dialog open onOpenChange={setExpanded}><DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto"><DialogTitle>Mermaid diagram</DialogTitle><CodeBlockMermaidPreview source={source} /></DialogContent></Dialog>}
    </section>
  );
}

function ChatMath({ latex, block }: { latex: string; block: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: block, throwOnError: false, trust: false, strict: false,
        macros: { "\\R": "\\mathbb{R}", "\\N": "\\mathbb{N}", "\\Z": "\\mathbb{Z}", "\\Q": "\\mathbb{Q}", "\\C": "\\mathbb{C}" },
      });
    } catch { return null; }
  }, [latex, block]);
  // Only KaTeX's trusted renderer produces this HTML; model HTML never enters it.
  return createElement(block ? "div" : "span", { className: block ? "ai-math-block" : "ai-math-inline", title: latex, ...(html ? { dangerouslySetInnerHTML: { __html: html } } : {}) }, html ? undefined : latex);
}

function mediaKind(url: string): "audio" | "video" | null {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(path)) return "audio";
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return "video";
  return null;
}

const SAFE_TAGS = ["a", "b", "i", "em", "strong", "u", "s", "del", "mark", "code", "pre", "blockquote", "p", "br", "hr", "span", "div", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td", "img", "input"];

/** Reuses Wings' Markdown, KaTeX, lowlight and Mermaid renderers for read-only chat. */
export const AIMessageContent = memo(function AIMessageContent({ content, pending = false }: { content: string; pending?: boolean }) {
  const body = useMemo(() => {
    const clean = DOMPurify.sanitize(markdownToHtml(content), {
      ALLOWED_TAGS: SAFE_TAGS,
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "data-type", "data-latex", "type", "checked", "start", "align"],
      ALLOW_DATA_ATTR: false,
    });
    return new DOMParser().parseFromString(clean, "text/html").body;
  }, [content]);

  function renderNode(node: ChildNode, key: number): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("data-type");
    if (type === "inline-math" || type === "block-math") return <ChatMath key={key} latex={el.getAttribute("data-latex") || ""} block={type === "block-math"} />;
    if (tag === "pre") {
      const code = el.querySelector("code");
      const language = normalizeCodeLanguage(code?.className.match(/language-([^\s]+)/)?.[1]);
      return <ChatCodeBlock key={key} source={(code?.textContent ?? el.textContent ?? "").replace(/\n$/, "")} language={language} pending={pending} />;
    }
    const children = Array.from(el.childNodes).map(renderNode);
    if (tag === "img") {
      const src = el.getAttribute("src");
      if (!src) return el.getAttribute("alt");
      const kind = mediaKind(src);
      if (kind === "audio") return <audio key={key} controls preload="none" src={src} aria-label={el.getAttribute("alt") || "Audio"} />;
      if (kind === "video") return <video key={key} controls preload="metadata" src={src} aria-label={el.getAttribute("alt") || "Video"} />;
      return <a key={key} href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={el.getAttribute("alt") || "Chat image"} loading="lazy" /></a>;
    }
    if (tag === "a") {
      const href = el.getAttribute("href");
      if (!href) return <span key={key}>{children}</span>;
      const kind = mediaKind(href);
      return <span key={key}>{kind === "audio" && <audio controls preload="none" src={href} />}{kind === "video" && <video controls preload="metadata" src={href} />}<a href={href} title={el.title} target="_blank" rel="noopener noreferrer">{children}</a></span>;
    }
    if (tag === "input") return el.getAttribute("type") === "checkbox" ? <input key={key} type="checkbox" checked={el.hasAttribute("checked")} disabled readOnly /> : null;
    if (tag === "table") return <div key={key} className="ai-table-scroll"><table>{children}</table></div>;
    const props: Record<string, unknown> = { key };
    if (tag === "ol" && el.hasAttribute("start")) props.start = Number(el.getAttribute("start"));
    if ((tag === "td" || tag === "th") && ["left", "center", "right"].includes(el.getAttribute("align"))) props.style = { textAlign: el.getAttribute("align") };
    return createElement(tag, props, ...children);
  }

  return <div className="ai-msg-prose">{Array.from(body.childNodes).map(renderNode)}{pending && <span className="nw-caret" />}</div>;
});
