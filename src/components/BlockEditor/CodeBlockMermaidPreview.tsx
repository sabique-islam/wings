import { useEffect, useId, useState } from "react";

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, source: string) => Promise<{ svg: string }>;
};

let mermaidModule: Promise<MermaidApi> | null = null;
let initializedTheme: string | null = null;

function documentTheme(): "dark" | "default" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default";
}

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidModule) {
    mermaidModule = import("mermaid").then((mod) => mod.default as unknown as MermaidApi);
  }
  return mermaidModule;
}

/**
 * SVG preview for a mermaid fence. The source stays in the document; a failed
 * render never calls setContent or otherwise rewrites the block.
 */
export function CodeBlockMermaidPreview({ source }: { source: string }) {
  const rawId = useId();
  const diagramId = `nwmermaid${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
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
          const rendered = await mermaid.render(diagramId, trimmed);
          if (cancelled) return;
          setError(null);
          setSvg(rendered.svg);
        } catch (cause) {
          if (cancelled) return;
          setSvg(null);
          setError(cause instanceof Error ? cause.message : "Could not render diagram");
        }
      })();
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, diagramId]);

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
