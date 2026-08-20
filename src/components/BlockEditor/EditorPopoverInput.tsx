import { useEffect, useRef, useState, useCallback } from "react";
import { CALLOUT_ICON_OPTIONS } from "@/lib/calloutIcons";

export type EditorPromptKind = "url" | "text" | "emoji";

export interface EditorPromptRequest {
  kind: EditorPromptKind;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: string | null) => void;
}

/** Inline popover prompt — replaces window.prompt in editor flows. */
export function EditorPopoverInput() {
  const [req, setReq] = useState<EditorPromptRequest | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<EditorPromptRequest>).detail;
      setReq(detail);
      setValue(detail.defaultValue ?? "");
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener("nw:editorPrompt", handler);
    return () => window.removeEventListener("nw:editorPrompt", handler);
  }, []);

  const finish = useCallback(
    (result: string | null) => {
      req?.resolve(result);
      setReq(null);
      setValue("");
    },
    [req],
  );

  if (!req) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[20vh] bg-background/20">
      <div
        className="min-w-[320px] max-w-md rounded-lg border border-border bg-popover shadow-xl p-4"
        role="dialog"
        aria-label={req.title}
      >
        <p className="text-sm font-medium mb-2">{req.title}</p>
        {req.kind === "emoji" ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {CALLOUT_ICON_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.emoji}
                  type="button"
                  title={opt.label}
                  aria-label={opt.label}
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground"
                  onClick={() => finish(opt.emoji)}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        ) : (
          <input
            ref={inputRef}
            type={req.kind === "url" ? "url" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={req.placeholder}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background outline-none focus:ring-1 focus:ring-accent-strong/40 mb-3"
            onKeyDown={(e) => {
              if (e.key === "Enter") finish(value.trim() || null);
              if (e.key === "Escape") finish(null);
            }}
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md hover:bg-muted"
            onClick={() => finish(null)}
          >
            Cancel
          </button>
          {req.kind !== "emoji" && (
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-md bg-accent-strong text-accent-strong-foreground"
              onClick={() => finish(value.trim() || null)}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function promptEditorInput(options: Omit<EditorPromptRequest, "resolve">): Promise<string | null> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent("nw:editorPrompt", {
        detail: { ...options, resolve },
      }),
    );
  });
}
