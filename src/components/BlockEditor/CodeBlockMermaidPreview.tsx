import { useEffect, useState } from "react";
import { sanitizeSvg } from "@/lib/sanitizeHtml";

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
};

let mermaidModule: Promise<MermaidApi> | null = null;
let initializedTheme: string | null = null;
let mermaidRenderSeq = 0;

function documentTheme(): "dark" | "default" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default";
}

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidModule) {
    mermaidModule = import("mermaid").then((mod) => mod.default as unknown as MermaidApi);
  }
  return mermaidModule;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        window.clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

/**
 * SVG preview for a mermaid fence. The source stays in the document; a failed
 * render never calls setContent or otherwise rewrites the block.
 */
export function CodeBlockMermaidPreview({ source }: { source: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = source.trim();
    if (!trimmed) {
      setSvg(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const renderId = `nwmermaid${++mermaidRenderSeq}`;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const mermaid = await loadMermaid();
          const theme = documentTheme();
          if (initializedTheme !== theme) {
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: "strict",
              theme,
              flowchart: { htmlLabels: false },
            });
            initializedTheme = theme;
          }
          const rendered = await withTimeout(
            mermaid.render(renderId, trimmed),
            8000,
            "Diagram preview timed out",
          );
          const clean = sanitizeSvg(rendered.svg);
          if (cancelled) return;
          if (!clean) {
            setSvg(null);
            setError("Could not render diagram");
            return;
          }
          setError(null);
          setSvg(clean);
        } catch (cause) {
          if (cancelled) return;
          setSvg(null);
          setError(cause instanceof Error ? cause.message : "Could not render diagram");
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source]);

  if (!source.trim()) return null;

  return (
    <div className="code-mermaid-preview" contentEditable={false} data-testid="code-mermaid-preview">
      {error ? (
        <p className="code-mermaid-error" data-testid="code-mermaid-error">
          {error}
        </p>
      ) : svg ? (
        <div className="code-mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="code-mermaid-pending">Rendering diagram…</p>
      )}
    </div>
  );
}
