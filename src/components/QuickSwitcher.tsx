import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Entry, searchEntries } from "@/lib/journal";
import { searchLocalEntries, type SearchHit } from "@/lib/localSearch";

interface Props {
  entries: Entry[];
  userId?: string;
  onSelect: (id: string) => void;
  onLinkPage?: (entry: Entry) => void;
  onEmbedPage?: (entry: Entry) => void;
  /** Destination for blocks the user chose to move out of the current page. */
  onMoveBlocks?: (entry: Entry) => void;
}

const SERVER_SEARCH_DEBOUNCE_MS = 250;
const MIN_SERVER_QUERY = 2;

const PLACEHOLDER: Record<Mode, string> = {
  jump: "Jump to entry…",
  link: "Link to page…",
  embed: "Embed a page…",
  move: "Move blocks to page…",
};

const ENTER_HINT: Record<Mode, string> = {
  jump: "select",
  link: "insert link",
  embed: "embed page",
  move: "move here",
};

type Mode = "jump" | "link" | "embed" | "move";

function getTitle(entry: Entry): string {
  return entry.title || entry.content.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60) || "Untitled";
}

export function QuickSwitcher({ entries, userId, onSelect, onLinkPage, onEmbedPage, onMoveBlocks }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("jump");
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const [serverHits, setServerHits] = useState<Entry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openIn = (next: Mode) => () => {
      setMode(next);
      setOpen(true);
      setQuery("");
      setIdx(0);
    };
    const onLink = openIn("link");
    const onEmbed = openIn("embed");
    const onMove = openIn("move");
    window.addEventListener("nw:linkpage", onLink);
    window.addEventListener("nw:embedpage", onEmbed);
    window.addEventListener("nw:moveBlocksToPage", onMove);
    return () => {
      window.removeEventListener("nw:linkpage", onLink);
      window.removeEventListener("nw:embedpage", onEmbed);
      window.removeEventListener("nw:moveBlocksToPage", onMove);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Local matching is substring-only, so Postgres full-text search is what finds
  // "running" from "runs". It answers after the list is already on screen, and
  // only contributes pages the local pass missed.
  useEffect(() => {
    if (!open || !userId) return;
    const needle = query.trim();
    if (needle.length < MIN_SERVER_QUERY) {
      setServerHits([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void searchEntries(userId, needle).then((found) => {
        if (current) setServerHits(found);
      });
    }, SERVER_SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, userId, query]);

  const hits = useMemo<SearchHit[]>(() => {
    const local = searchLocalEntries(entries, query);
    if (serverHits.length === 0 || !query.trim()) return local;
    const seen = new Set(local.map((hit) => hit.entry.id));
    const extra = serverHits.filter((entry) => !seen.has(entry.id)).map((entry) => ({ entry, snippet: null }));
    return [...local, ...extra];
  }, [entries, query, serverHits]);

  const pick = useCallback((entry: Entry) => {
    if (mode === "link" && onLinkPage) onLinkPage(entry);
    else if (mode === "embed" && onEmbedPage) onEmbedPage(entry);
    else if (mode === "move" && onMoveBlocks) onMoveBlocks(entry);
    else onSelect(entry.id);
    setOpen(false);
  }, [mode, onSelect, onLinkPage, onEmbedPage, onMoveBlocks]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-background/80" />
      <div
        className="relative w-full max-w-md bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIdx(0); }}
          placeholder={PLACEHOLDER[mode]}
          className="w-full bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none font-mono border-b border-border"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter" && hits[idx]) pick(hits[idx].entry);
          }}
        />
        <ul className="max-h-64 overflow-y-auto py-1">
          {hits.length === 0 && (
            <li className="px-4 py-3 text-xs text-muted-foreground/50 font-mono">no results</li>
          )}
          {hits.map(({ entry, snippet }, i) => (
            <li key={entry.id}>
              <button
                onClick={() => pick(entry)}
                className={`w-full text-left px-4 py-2 text-xs font-mono flex items-center gap-2 transition-colors ${
                  i === idx ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{getTitle(entry)}</span>
                  {snippet && (
                    <span className="block truncate text-[10px] text-muted-foreground/40">{snippet}</span>
                  )}
                </span>
                <span className="text-[10px] text-muted-foreground/30 shrink-0">
                  {new Date(entry.created_at).toLocaleDateString("default", { month: "short", day: "numeric" })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-1.5 text-[10px] text-muted-foreground/30 font-mono">
          ↑↓ navigate · enter {ENTER_HINT[mode]} · esc close
        </div>
      </div>
    </div>
  );
}
