import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Wand2, Languages, Scissors, Maximize2, ListChecks, Loader2 } from "@/lib/icons";
import { generateOnce, getApiKey } from "@/lib/aiClient";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { markdownToHtml } from "@/lib/markdown";

/**
 * The editor is published by BlockEditor after it mounts, so read it when the
 * menu is used rather than capturing whatever was there at render time.
 */
function currentEditor(): any {
  return (window as any).__nw_editor;
}

const PRESETS = [
  { id: "improve", label: "Improve writing", icon: Wand2, prompt: "Improve the writing quality. Keep the meaning and length similar. Output ONLY the rewritten markdown — no preamble." },
  { id: "shorter", label: "Make shorter", icon: Scissors, prompt: "Rewrite this to be roughly half as long while keeping the key points. Output ONLY markdown." },
  { id: "longer", label: "Make longer", icon: Maximize2, prompt: "Expand this with more detail and examples. Keep the same tone. Output ONLY markdown." },
  { id: "summarize", label: "Summarize", icon: ListChecks, prompt: "Summarize this as 3-5 concise bullet points. Output ONLY markdown bullets." },
  { id: "translate", label: "Translate to English", icon: Languages, prompt: "Translate to natural English. If already English, translate to Spanish. Output ONLY the translated text." },
];

export function InlineAIMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openMenu = useCallback(() => {
    const editor = currentEditor();
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX });
    setOpen(true);
    setCustom("");
  }, []);

  // Expose globally so BubbleMenu button can trigger
  useEffect(() => {
    (window as any).__nw_openInlineAI = openMenu;
    return () => {
      delete (window as any).__nw_openInlineAI;
    };
  }, [openMenu]);

  const runPrompt = async (instruction: string) => {
    const editor = currentEditor();
    if (!editor) return;
    if (!getApiKey()) {
      window.dispatchEvent(new CustomEvent("nw:openAI"));
      setOpen(false);
      return;
    }
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText) return;
    setBusy(true);
    try {
      const result = await generateOnce({
        prompt: `${instruction}\n\nText:\n"""\n${selectedText}\n"""`,
      });
      const html = sanitizeHtml(markdownToHtml(result.trim()));
      editor.chain().focus().insertContentAt({ from, to }, html).run();
    } catch (e: unknown) {
      console.error(e);
      toast.error((e as Error)?.message || "AI request failed");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  if (!open || !pos) return null;

  return (
    <div
      ref={ref}
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-xl w-[260px] overflow-hidden"
    >
      <div className="p-2 border-b border-border flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <input
          autoFocus
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              runPrompt(`${custom.trim()}. Output ONLY the resulting markdown text, no preamble.`);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Ask AI to edit selection…"
          className="flex-1 bg-transparent text-xs focus:outline-none"
        />
        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="py-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            disabled={busy}
            onClick={() => runPrompt(p.prompt)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-muted-foreground hover:text-foreground hover:bg-accent/50 disabled:opacity-50 transition-colors"
          >
            <p.icon className="h-3 w-3" />
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
