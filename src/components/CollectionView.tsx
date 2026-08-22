import { FileText, LayoutList, PanelLeft, Pencil } from "@/lib/icons";
import { matchCollection, type CollectionInfo } from "@/lib/collections";
import { getEntryTitle, type Entry } from "@/lib/journal";

interface Props {
  collection: CollectionInfo;
  entries: Entry[];
  onToggleSidebar: () => void;
  onSelect: (id: string) => void;
  onEdit: () => void;
}

export function CollectionView({ collection, entries, onToggleSidebar, onSelect, onEdit }: Props) {
  const matched = matchCollection(entries, collection);

  return (
    <div className="flex-1 flex flex-col h-screen min-w-0 w-full">
      <header className="h-12 flex items-center px-2 sm:px-3 border-b border-border-subtle gap-1 sm:gap-2 shrink-0">
        <button onClick={onToggleSidebar} className="text-muted-foreground hover:text-foreground transition-colors" title="Toggle sidebar (⌘B)">
          <PanelLeft className="h-4 w-4" />
        </button>
        <LayoutList className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm truncate">{collection.name || "Untitled"}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{matched.length}</span>
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Edit collection"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {matched.length === 0 ? (
          <p className="text-sm text-muted-foreground">no matching pages.</p>
        ) : (
          <ul className="flex flex-col gap-px max-w-xl">
            {matched.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-sidebar-foreground/80 hover:text-foreground hover:bg-sidebar-accent/60"
                >
                  <FileText className="h-3 w-3 opacity-60 shrink-0" />
                  <span className="truncate">{getEntryTitle(entry)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
