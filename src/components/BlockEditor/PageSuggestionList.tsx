import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { FileText, Plus } from "@/lib/icons";
import tippy, { type Instance as TippyInstance } from "tippy.js";

export interface PageSuggestion {
  id: string;
  title: string;
}

export interface PageSuggestionListProps {
  items: PageSuggestion[];
  command: (item: PageSuggestion) => void;
  /** When set, an extra row offers to create the page the query describes. */
  onCreate?: (title: string) => void;
  query?: string;
}

/**
 * Shared picker for the `@` mention and `[[` wikilink suggestions. Arrow keys
 * and Enter are handled here because TipTap's Suggestion plugin forwards raw
 * key events to whatever the renderer exposes.
 */
export const PageSuggestionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  PageSuggestionListProps
>(({ items, command, onCreate, query }, ref) => {
  const createTitle = query?.trim() ?? "";
  const canCreate = Boolean(onCreate) && createTitle.length > 0;
  const optionCount = items.length + (canCreate ? 1 : 0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items, canCreate]);

  const choose = (index: number) => {
    if (index < items.length) {
      command(items[index]!);
      return;
    }
    if (canCreate) onCreate!(createTitle);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (!optionCount) return false;
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + optionCount - 1) % optionCount);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % optionCount);
        return true;
      }
      if (event.key === "Enter") {
        choose(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (!optionCount) {
    return (
      <div className="bg-card border border-border rounded-md p-2 shadow-lg min-w-[200px]">
        <p className="text-[11px] text-muted-foreground px-2">No pages found</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-xl overflow-hidden min-w-[240px] max-h-[240px] overflow-y-auto">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => command(item)}
          className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs ${
            index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
          }`}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{item.title || "Untitled"}</span>
        </button>
      ))}
      {canCreate && (
        <button
          type="button"
          onClick={() => onCreate!(createTitle)}
          className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs border-t border-border-subtle ${
            selectedIndex === items.length ? "bg-accent" : "hover:bg-accent/50"
          }`}
        >
          <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            New page “<span className="font-medium">{createTitle}</span>”
          </span>
        </button>
      )}
    </div>
  );
});
PageSuggestionList.displayName = "PageSuggestionList";

/** Tippy plumbing shared by every page suggestion popup. */
export function renderPageSuggestions() {
  let component: ReactRenderer | null = null;
  let popup: TippyInstance[] | null = null;
  return {
    onStart: (props: any) => {
      component = new ReactRenderer(PageSuggestionList, { props, editor: props.editor });
      if (!props.clientRect) return;
      popup = tippy("body", {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      });
    },
    onUpdate(props: any) {
      component?.updateProps(props);
      popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect });
    },
    onKeyDown(props: any) {
      if (props.event.key === "Escape") {
        popup?.[0]?.hide();
        return true;
      }
      return (component?.ref as any)?.onKeyDown(props) ?? false;
    },
    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
    },
  };
}
