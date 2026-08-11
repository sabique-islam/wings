import { useMemo, useSyncExternalStore } from "react";
import { ArrowUpLeft, Link2Off } from "@/lib/icons";
import { getBacklinks, getLinkIndexVersion, getUnresolvedLinks, subscribeLinkIndex } from "@/lib/linkIndex";
import { getEntryTitle, type Entry } from "@/lib/journal";

interface Props {
  entryId: string;
  entries: Entry[];
  onNavigate: (id: string) => void;
}

/**
 * Obsidian-style linked mentions, answered entirely from the local link index —
 * opening a page never queries the server for its backlinks.
 */
export function BacklinksPanel({ entryId, entries, onNavigate }: Props) {
  const version = useSyncExternalStore(subscribeLinkIndex, getLinkIndexVersion, () => 0);

  const { linked, unresolved } = useMemo(() => {
    void version;
    const byId = new Map(entries.map((e) => [e.id, e]));
    return {
      linked: getBacklinks(entryId)
        .map((source) => ({ entry: byId.get(source.entryId), context: source.context }))
        .filter((source): source is { entry: Entry; context: string } => source.entry != null),
      unresolved: getUnresolvedLinks(entryId),
    };
  }, [entryId, entries, version]);

  if (linked.length === 0 && unresolved.length === 0) return null;

  return (
    <section className="mt-16 pt-4 border-t border-border-subtle">
      {linked.length > 0 && (
        <>
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-2">
            {linked.length} linked mention{linked.length === 1 ? "" : "s"}
          </h2>
          <ul className="space-y-0.5">
            {linked.map(({ entry, context }) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(entry.id)}
                  className="block w-full text-left px-2 py-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs">
                    <ArrowUpLeft className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{getEntryTitle(entry)}</span>
                  </span>
                  {context && (
                    <span className="block pl-[22px] text-[11px] leading-relaxed text-muted-foreground/60 line-clamp-2">
                      {context}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {unresolved.length > 0 && (
        <>
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-2 mt-4">
            Unlinked
          </h2>
          <ul className="flex flex-wrap gap-1.5 px-2">
            {unresolved.map((title) => (
              <li
                key={title}
                className="flex items-center gap-1 text-[11px] text-muted-foreground/70 border border-border-subtle rounded px-1.5 py-0.5"
                title="No page with this title yet"
              >
                <Link2Off className="h-3 w-3 opacity-60" />
                {title}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
