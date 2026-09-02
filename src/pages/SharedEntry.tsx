import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import type { JSONContent } from "@tiptap/core";
import { BlockEditor } from "@/components/BlockEditor/BlockEditor";
import { LoadingScreen } from "@/components/ui/spinner";
import { Seo } from "@/components/Seo";
import { fetchSharedEntry, isValidShareToken } from "@/lib/sharedEntry";
import { contentLooksFullWidth, pageEditorWidthClass } from "@/lib/editorAppearance";

export default function SharedEntry() {
  const { token } = useParams<{ token: string }>();
  const [content, setContent] = useState<string | null>(null);
  const [contentJson, setContentJson] = useState<JSONContent | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    if (!isValidShareToken(token)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchSharedEntry(token);
        if (cancelled) return;
        if (row) {
          setContent(row.content);
          setContentJson(row.content_json);
          setTitle(row.title || "");
          setDate(
            new Date(row.created_at).toLocaleDateString("default", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          );
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return <LoadingScreen variant="gyro" />;
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4 px-4 text-center">
        <pre className="text-muted-foreground/30 font-mono text-xs">
{`  ___  
 / _ \\ 
| | | |
| |_| |
 \\___/ `}
        </pre>
        <p className="text-xs text-muted-foreground font-mono">this page doesn't exist or is no longer shared</p>
        <a href="/" className="text-[10px] text-muted-foreground/50 hover:text-foreground font-mono transition-colors">
          ← wings
        </a>
      </div>
    );
  }

  const wide = contentLooksFullWidth(content || "", contentJson);

  return (
    <div className="min-h-screen bg-background">
      <Seo title={title || "shared note"} path={`/s/${token ?? ""}`} noIndex />
      <header className="h-12 flex items-center px-4 sm:px-6 border-b border-border justify-between gap-4">
        <a href="/" className="text-[10px] text-muted-foreground/50 hover:text-foreground font-mono transition-colors uppercase tracking-wider shrink-0">
          wings
        </a>
        {title && (
          <span className="text-xs text-foreground font-mono truncate min-w-0">{title}</span>
        )}
        <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0 hidden sm:block">{date}</span>
      </header>
      <div className={`${pageEditorWidthClass(wide)} mx-auto px-2 sm:px-6`}>
        <BlockEditor
          key={token}
          peek
          entryId={`shared-${token ?? "readonly"}`}
          content={content || ""}
          contentJson={contentJson}
          onChange={() => {}}
          editable={false}
        />
      </div>
    </div>
  );
}
