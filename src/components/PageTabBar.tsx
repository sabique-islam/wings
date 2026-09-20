import { useEffect, useRef, useState } from "react";
import { FileText, LayoutList, Plus, Trash2, X } from "@/lib/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { PageTab } from "@/lib/pageTabs";
import { tabKey } from "@/lib/pageTabs";

export type PageTabView = {
  tab: PageTab;
  title: string;
};

interface Props {
  tabs: PageTabView[];
  activeKey: string | null;
  onSelect: (tab: PageTab) => void;
  onClose: (tab: PageTab) => void;
  onCloseOthers: (tab: PageTab) => void;
  onCloseToRight: (tab: PageTab) => void;
  onMove: (from: number, to: number) => void;
  onNew: () => void;
}

function TabIcon({ tab }: { tab: PageTab }) {
  if (tab.kind === "trash") return <Trash2 className="h-3 w-3 shrink-0 opacity-70" />;
  if (tab.kind === "collection") return <LayoutList className="h-3 w-3 shrink-0 opacity-70" />;
  return <FileText className="h-3 w-3 shrink-0 opacity-70" />;
}

export function PageTabBar({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onMove,
  onNew,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    const active = scrollerRef.current?.querySelector('[aria-selected="true"]');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeKey, tabs.length]);

  return (
    <div
      className="flex h-9 shrink-0 items-stretch border-b border-border-subtle bg-sidebar text-sidebar-foreground"
      data-testid="page-tab-bar"
    >
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Open pages"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
          event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        {tabs.map((item, index) => {
          const key = tabKey(item.tab);
          const active = key === activeKey;
          const drop = dropIndex === index && dragging != null && dragging !== index;
          return (
            <ContextMenu key={key}>
              <ContextMenuTrigger asChild>
                <div
                  role="tab"
                  aria-selected={active}
                  title={item.title}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", key);
                    setDragging(index);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropIndex(null);
                  }}
                  onDragOver={(event) => {
                    if (dragging == null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging != null) onMove(dragging, index);
                    setDragging(null);
                    setDropIndex(null);
                  }}
                  tabIndex={active ? 0 : -1}
                  data-testid="page-tab"
                  data-tab-key={key}
                  onClick={() => onSelect(item.tab)}
                  onMouseDown={(event) => {
                    if (event.button === 1) event.preventDefault();
                  }}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      onClose(item.tab);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                      event.preventDefault();
                      const next = tabs[index + (event.key === "ArrowRight" ? 1 : -1)];
                      if (next) onSelect(next.tab);
                      return;
                    }
                    if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault();
                      onClose(item.tab);
                    }
                  }}
                  className={cn(
                    "group relative flex max-w-[14rem] min-w-[7rem] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border-subtle px-2.5 text-[12px] transition-colors",
                    active
                      ? "bg-background text-foreground"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                    dragging === index && "opacity-40",
                    drop && "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent-strong",
                  )}
                >
                  <TabIcon tab={item.tab} />
                  <span className="min-w-0 flex-1 truncate text-left">{item.title}</span>
                  <button
                    type="button"
                    aria-label={`Close ${item.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(item.tab);
                    }}
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="font-mono text-xs">
                <ContextMenuItem onClick={() => onClose(item.tab)}>Close</ContextMenuItem>
                <ContextMenuItem onClick={() => onCloseOthers(item.tab)} disabled={tabs.length < 2}>
                  Close others
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onCloseToRight(item.tab)}
                  disabled={index === tabs.length - 1}
                >
                  Close tabs to the right
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={onNew}>New page</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onNew}
        aria-label="New page"
        title="New page"
        className="grid w-9 shrink-0 place-items-center text-muted-foreground hover:bg-background/60 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
