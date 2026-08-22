import { useEffect, useState } from "react";
import { FileText, Plus, Settings, Share2, Sparkles, PanelLeft, Pin, Copy, LayoutList, Trash2 } from "@/lib/icons";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from "@/components/ui/command";
import { Entry, getEntryTitle } from "@/lib/journal";
import { searchLocalEntries } from "@/lib/localSearch";
import { isEditorFocused } from "@/lib/keyboard";
import type { CollectionInfo } from "@/lib/collections";

interface Props {
  entries: Entry[];
  collections?: CollectionInfo[];
  onSelect: (id: string) => void;
  onSelectCollection?: (id: string) => void;
  onOpenTrash?: () => void;
  onNew: () => void;
  onToggleSidebar: () => void;
}

export function CommandPalette({
  entries,
  collections = [],
  onSelect,
  onSelectCollection,
  onOpenTrash,
  onNew,
  onToggleSidebar,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (isEditorFocused()) return;
        e.preventDefault();
        setOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const openSearch = () => setOpen(true);
    window.addEventListener("nw:search", openSearch);
    return () => window.removeEventListener("nw:search", openSearch);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const live = entries.filter((entry) => !entry.deleted_at);
  const pinned = live.filter((e) => e.pinned).slice(0, 6);
  const pages = searchLocalEntries(live, "", 40);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="search pages or run a command…" />
      <CommandList>
        <CommandEmpty>no results.</CommandEmpty>
        <CommandGroup heading="actions">
          <CommandItem onSelect={() => run(onNew)}>
            <Plus className="mr-2" /> new page <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => window.dispatchEvent(new CustomEvent("nw:openAI")))}>
            <Sparkles className="mr-2" /> open AI assistant <CommandShortcut>⌘J</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => onOpenTrash?.())}>
            <Trash2 className="mr-2" /> open trash
          </CommandItem>
          <CommandItem onSelect={() => run(() => window.dispatchEvent(new CustomEvent("nw:graph")))}>
            <Share2 className="mr-2" /> open graph view <CommandShortcut>⌘⇧G</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onToggleSidebar)}>
            <PanelLeft className="mr-2" /> toggle sidebar <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => window.dispatchEvent(new CustomEvent("nw:settings")))}>
            <Settings className="mr-2" /> settings
          </CommandItem>
          <CommandItem onSelect={() => run(() => window.dispatchEvent(new CustomEvent("nw:copy-markdown")))}>
            <Copy className="mr-2" /> copy as markdown <CommandShortcut>⌘⇧C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => window.dispatchEvent(new CustomEvent("nw:copy-plaintext")))}>
            <Copy className="mr-2" /> copy as plaintext
          </CommandItem>
          <CommandItem onSelect={() => run(() => window.dispatchEvent(new CustomEvent("nw:copy-page-markdown")))}>
            <FileText className="mr-2" /> copy page markdown
          </CommandItem>
        </CommandGroup>

        {pinned.length > 0 && (
          <CommandGroup heading="favorites">
            {pinned.map((e) => (
              <CommandItem key={e.id} value={`fav ${getEntryTitle(e)}`} onSelect={() => run(() => onSelect(e.id))}>
                <Pin className="mr-2" /> {getEntryTitle(e)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {collections.length > 0 && (
          <CommandGroup heading="collections">
            {collections.map((collection) => (
              <CommandItem
                key={collection.id}
                value={`collection ${collection.name}`}
                onSelect={() => run(() => onSelectCollection?.(collection.id))}
              >
                <LayoutList className="mr-2" /> {collection.name || "Untitled"}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="jump to page">
          {pages.map(({ entry }) => (
            <CommandItem key={entry.id} value={getEntryTitle(entry)} onSelect={() => run(() => onSelect(entry.id))}>
              <FileText className="mr-2" /> {getEntryTitle(entry)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
