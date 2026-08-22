import { useEffect, useState } from "react";
import { FileText, Plus, Search, Settings, Share2, Sparkles, PanelLeft, Pin, Copy } from "@/lib/icons";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from "@/components/ui/command";
import { Entry, getEntryTitle } from "@/lib/journal";
import { isEditorFocused } from "@/lib/keyboard";

interface Props {
  entries: Entry[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onToggleSidebar: () => void;
}

export function CommandPalette({ entries, onSelect, onNew, onToggleSidebar }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (isEditorFocused()) return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const pinned = entries.filter((e) => e.pinned).slice(0, 6);
  const recent = entries.filter((e) => !e.pinned).slice(0, 20);

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
          <CommandItem onSelect={() => run(() => window.dispatchEvent(new CustomEvent("nw:search")))}>
            <Search className="mr-2" /> search pages <CommandShortcut>⌘/</CommandShortcut>
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

        <CommandGroup heading="jump to page">
          {recent.map((e) => (
            <CommandItem key={e.id} value={getEntryTitle(e)} onSelect={() => run(() => onSelect(e.id))}>
              <FileText className="mr-2" /> {getEntryTitle(e)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
