import { useState, useEffect, useRef, useCallback, memo, type ReactNode } from "react";
import {
  Plus,
  FileText,
  Search,
  X,
  Pin,
  ChevronRight,
  Settings,
  Trash2,
  LayoutGrid,
  LayoutList,
  MoreHorizontal,
  PinOff,
  Lock,
  Folder,
  FolderOpen,
} from "@/lib/icons";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SharpHighlight } from "@/components/ui/sharp";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Entry,
  ShareRole,
  getEntryTitle,
  getChildEntries,
  getRootEntries,
  groupByMonth,
  getPinnedEntries,
} from "@/lib/journal";
import { matchCollection, type CollectionInfo } from "@/lib/collections";
import { isLocalEntry } from "@/lib/localContent";
import { isDescendantOf, type DropPlacement } from "@/lib/pageOrder";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EASE = "cubic-bezier(0.165,0.85,0.45,1)";
const DURATION = 300;
const EXPANDED = "18rem";
const COLLAPSED = "3.3rem";

interface Props {
  allEntries: Entry[];
  roleMap: Record<string, ShareRole>;
  userId: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  sidebarOpen: boolean;
  onToggle: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onRefetch: () => void;
  onHome?: () => void;
  onReorder?: (draggedId: string, targetId: string, placement: DropPlacement) => void;
  onMove?: (draggedId: string, parentId: string | null) => void;
  onDelete?: (id: string) => void;
  onTogglePin?: (id: string, pinned: boolean) => void;
  collections?: CollectionInfo[];
  activeCollectionId?: string | null;
  trashActive?: boolean;
  overviewActive?: boolean;
  onOpenTrash?: () => void;
  onOpenCollection?: (id: string) => void;
  onCreateCollection?: () => void;
  onEditCollection?: (id: string) => void;
  onDeleteCollection?: (id: string) => void;
  onAddToCollection?: (collectionId: string, entryId: string) => void;
}

type DropZone = DropPlacement | "inside";
const ROOT_TARGET = "";

type NavItem = {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  droppable?: boolean;
  dropActive?: boolean;
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
};

function dropZoneAt(event: React.DragEvent<HTMLElement>): DropZone {
  const { top, height } = event.currentTarget.getBoundingClientRect();
  const offset = (event.clientY - top) / height;
  if (offset < 0.25) return "before";
  if (offset > 0.75) return "after";
  return "inside";
}

export const JournalSidebar = memo(function JournalSidebar({
  allEntries,
  roleMap,
  userId,
  activeId,
  onSelect,
  onNew,
  sidebarOpen,
  onToggle,
  collapsed,
  onCollapsedChange,
  onRefetch,
  onHome,
  onReorder,
  onMove,
  onDelete,
  onTogglePin,
  collections = [],
  activeCollectionId = null,
  trashActive = false,
  overviewActive = false,
  onOpenTrash,
  onOpenCollection,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  onAddToCollection,
}: Props) {
  const isMobile = useIsMobile();
  const railCollapsed = !isMobile && collapsed;

  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: DropZone } | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingTrashId, setPendingTrashId] = useState<string | null>(null);
  const [trashDropActive, setTrashDropActive] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const isShared = useCallback(
    (e: Entry) => !!roleMap[e.id] && roleMap[e.id] !== "owner",
    [roleMap],
  );

  const owned = allEntries.filter((e) => !isShared(e));
  const pinned = getPinnedEntries(owned);
  const sharedRoots = allEntries.filter((e) => isShared(e) && !e.parent_id);
  const months = groupByMonth(getRootEntries(owned));

  useEffect(() => {
    if (searching && searchRef.current) searchRef.current.focus();
  }, [searching]);

  const pendingTrash = pendingTrashId
    ? allEntries.find((entry) => entry.id === pendingTrashId) ?? null
    : null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openSearch = () => {
    if (railCollapsed) onCollapsedChange(false);
    window.dispatchEvent(new CustomEvent("nw:search"));
  };

  const navItems: NavItem[] = [
    { id: "new", label: "New page", icon: <PlusNavIcon />, shortcut: "⌘N", onClick: onNew },
    { id: "search", label: "Search", icon: <Search className="h-4 w-4" />, shortcut: "⌘/", onClick: openSearch },
    {
      id: "overview",
      label: "Overview",
      icon: <LayoutGrid className="h-4 w-4" />,
      onClick: () => onHome?.(),
      active: overviewActive,
    },
    {
      id: "trash",
      label: "Trash",
      icon: <Trash2 className="h-4 w-4" />,
      onClick: () => onOpenTrash?.(),
      active: trashActive || trashDropActive,
      droppable: true,
      dropActive: trashDropActive,
      onDragOver: (event) => {
        if (!dragging) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setTrashDropActive(true);
      },
      onDragLeave: () => setTrashDropActive(false),
      onDrop: (event) => {
        event.preventDefault();
        setTrashDropActive(false);
        if (dragging) setPendingTrashId(dragging);
        setDragging(null);
        setDropTarget(null);
      },
    },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="h-4 w-4" />,
      onClick: () => window.dispatchEvent(new CustomEvent("nw:settings")),
    },
  ];

  const q = search.trim().toLowerCase();
  const match = (e: Entry) =>
    getEntryTitle(e).toLowerCase().includes(q) || e.content.toLowerCase().includes(q);

  const filteredMonths = q
    ? months.map((m) => ({ ...m, entries: m.entries.filter(match) })).filter((m) => m.entries.length > 0)
    : months;
  const filteredPinned = q ? pinned.filter(match) : pinned;
  const filteredShared = q ? sharedRoots.filter(match) : sharedRoots;

  const canDrop = (entry: Entry) =>
    dragging != null && !q && dragging !== entry.id && !isDescendantOf(allEntries, dragging, entry.id);

  const handleDrop = (entry: Entry, zone: DropZone) => {
    if (!dragging || !canDrop(entry)) return;
    if (zone === "inside") onMove?.(dragging, entry.id);
    else onReorder?.(dragging, entry.id, zone);
  };

  const renderEntry = (entry: Entry, depth = 0) => {
    const preview = getEntryTitle(entry);
    const isActive = entry.id === activeId;
    const children = getChildEntries(allEntries, entry.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(entry.id);
    const drop = dropTarget?.id === entry.id ? dropTarget.zone : null;
    const role = roleMap[entry.id] || "owner";
    const canManage = role === "owner" || role === "admin";

    return (
      <li key={entry.id}>
        <div
          className={cn(
            "flex items-center group relative",
            drop === "before" && "before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-accent-strong before:rounded-full",
            drop === "after" && "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent-strong after:rounded-full",
            drop === "inside" && "ring-1 ring-accent-strong/60 rounded-lg",
            dragging === entry.id && "opacity-40",
          )}
          draggable={!isShared(entry) && !q}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", entry.id);
            setDragging(entry.id);
          }}
          onDragEnd={() => {
            setDragging(null);
            setDropTarget(null);
          }}
          onDragOver={(event) => {
            if (!canDrop(entry)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTarget({ id: entry.id, zone: dropZoneAt(event) });
          }}
          onDragLeave={() => setDropTarget((prev) => (prev?.id === entry.id ? null : prev))}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop(entry, dropZoneAt(event));
            setDropTarget(null);
            setDragging(null);
          }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(entry.id)}
              className="p-0.5 text-muted-foreground hover:text-sidebar-foreground transition-colors shrink-0"
              aria-label={isExpanded ? "collapse" : "expand"}
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <EntryRow
            title={preview}
            active={isActive}
            pinned={entry.pinned}
            isLocal={isLocalEntry(entry)}
            hasChildren={hasChildren}
            expanded={isExpanded}
            canManage={canManage}
            onClick={() => onSelect(entry.id)}
            onTogglePin={canManage ? () => onTogglePin?.(entry.id, !entry.pinned) : undefined}
            onDelete={canManage ? () => onDelete?.(entry.id) : undefined}
          />
        </div>
        {hasChildren && isExpanded && !q && (
          <ul className="ml-3 border-l border-sidebar-border space-y-px mt-0.5">
            {children.map((child) => renderEntry(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const sidebarBody = (
    <SidebarProvider defaultOpen className="h-full w-full">
      <div
        className="h-full shrink-0 overflow-hidden"
        style={{
          width: isMobile ? EXPANDED : railCollapsed ? COLLAPSED : EXPANDED,
          transition: isMobile ? undefined : `width ${DURATION}ms ${EASE}`,
        }}
      >
        <Sidebar collapsible="none" className="h-full w-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
          <div
            className={cn(
              "flex h-12 shrink-0 items-center border-b border-sidebar-border",
              isMobile ? "justify-between px-3" : railCollapsed ? "justify-center" : "px-3",
            )}
          >
            <button type="button" onClick={onHome} className="flex items-center gap-2">
              <Logo
                size={22}
                withWordmark={!railCollapsed}
                wordmarkClassName="text-sm font-display font-semibold"
              />
            </button>
            {isMobile && (
              <button
                type="button"
                aria-label="Close sidebar"
                onClick={onToggle}
                className="grid size-8 place-items-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <SidebarMenu className={cn("gap-px pt-2", railCollapsed ? "px-1" : "px-2")}>
            {navItems.map((it) => (
              <SidebarMenuItem key={it.id} className="list-none!">
                <NavRow item={it} collapsed={railCollapsed} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>

          <SidebarContent
            className="gap-0! pt-2 overflow-x-hidden! flex-1 min-h-0"
            style={{
              transition: `opacity 150ms ${EASE}`,
              opacity: railCollapsed ? 0 : 1,
              pointerEvents: railCollapsed ? "none" : "auto",
            }}
            aria-hidden={railCollapsed}
          >
            <div
              className="px-2 pb-2"
              style={{ display: railCollapsed ? "none" : undefined }}
            >
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearching(true)}
                  placeholder="search pages…"
                  className="w-full rounded-lg border border-sidebar-border bg-background/50 pl-8 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearch("");
                      setSearching(false);
                      searchRef.current?.blur();
                    }
                  }}
                />
                {(search || searching) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setSearching(false);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {filteredPinned.length > 0 && (
                <SidebarSection title="Pinned">
                  {filteredPinned.map((e) => renderEntry(e))}
                </SidebarSection>
              )}

              <SidebarSection
                title="Collections"
                action={
                  <button
                    type="button"
                    onClick={onCreateCollection}
                    className="grid size-5 place-items-center text-muted-foreground hover:text-foreground"
                    aria-label="New collection"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                }
              >
                {collections.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">no collections yet</p>
                ) : (
                  collections
                    .filter((collection) => {
                      if (!q) return true;
                      if (collection.name.toLowerCase().includes(q)) return true;
                      return matchCollection(allEntries, collection).some(match);
                    })
                    .map((collection) => {
                      const members = matchCollection(allEntries, collection);
                      const collectionKey = `c:${collection.id}`;
                      const isExpanded = expanded.has(collectionKey);
                      const isActive = collection.id === activeCollectionId;
                      const drop = dropTarget?.id === collectionKey;
                      return (
                        <li key={collection.id}>
                          <div
                            className={cn(
                              "flex items-center group relative",
                              drop && "ring-1 ring-accent-strong/60 rounded-lg",
                            )}
                            onDragOver={(event) => {
                              if (!dragging || q) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "copy";
                              setDropTarget({ id: collectionKey, zone: "inside" });
                            }}
                            onDragLeave={() => setDropTarget((prev) => (prev?.id === collectionKey ? null : prev))}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (dragging) onAddToCollection?.(collection.id, dragging);
                              setDropTarget(null);
                              setDragging(null);
                            }}
                          >
                            {members.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(collectionKey)}
                                className="p-0.5 text-muted-foreground hover:text-sidebar-foreground transition-colors shrink-0"
                                aria-label={isExpanded ? "collapse" : "expand"}
                              >
                                <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
                              </button>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <div
                              className={cn(
                                "group relative flex h-8 w-full min-w-0 items-center text-[13px] transition-colors duration-75 overflow-visible",
                                isActive ? "text-accent-strong" : "text-sidebar-foreground/80 hover:text-foreground",
                              )}
                            >
                              <SharpHighlight active={isActive} />
                              <button
                                type="button"
                                onClick={() => onOpenCollection?.(collection.id)}
                                className="relative z-10 flex min-w-0 flex-1 items-center px-2"
                              >
                                <span className="grid size-4 shrink-0 place-items-center mr-2">
                                  <LayoutList className="h-3 w-3 opacity-60" />
                                </span>
                                <span className="flex-1 truncate text-left">{collection.name || "Untitled"}</span>
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    draggable={false}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="relative z-10 mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-sidebar-accent data-[state=open]:opacity-100"
                                    aria-label="Collection actions"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="font-mono text-xs">
                                  <DropdownMenuItem onClick={() => onEditCollection?.(collection.id)}>
                                    edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => onDeleteCollection?.(collection.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {isExpanded && members.length > 0 && (
                            <ul className="ml-3 border-l border-sidebar-border space-y-px mt-0.5">
                              {members.map((child) => renderEntry(child, 1))}
                            </ul>
                          )}
                        </li>
                      );
                    })
                )}
              </SidebarSection>

              <div
                className={cn(
                  "mb-4",
                  dropTarget?.id === ROOT_TARGET && "ring-1 ring-accent-strong/60 rounded-lg",
                )}
                onDragOver={(event) => {
                  if (!dragging || q) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget({ id: ROOT_TARGET, zone: "inside" });
                }}
                onDragLeave={() => setDropTarget((prev) => (prev?.id === ROOT_TARGET ? null : prev))}
                onDrop={(event) => {
                  event.preventDefault();
                  setDropTarget(null);
                  if (dragging) onMove?.(dragging, null);
                  setDragging(null);
                }}
              >
                <SidebarSection title="Pages">
                  {filteredMonths.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">{q ? "no matches" : "no pages yet"}</p>
                  ) : (
                    filteredMonths.map((month) => (
                      <div key={month.key} className="mb-3">
                        <p className="px-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground select-none">
                          {month.label}
                        </p>
                        <ul className="flex flex-col gap-px">{month.entries.map((e) => renderEntry(e))}</ul>
                      </div>
                    ))
                  )}
                </SidebarSection>
              </div>

              {filteredShared.length > 0 && (
                <SidebarSection title="Shared with me">
                  {filteredShared.map((e) => renderEntry(e))}
                </SidebarSection>
              )}
            </div>
          </SidebarContent>
        </Sidebar>
      </div>
    </SidebarProvider>
  );

  const trashConfirm = (
    <AlertDialog open={pendingTrashId != null} onOpenChange={(open) => { if (!open) setPendingTrashId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move to trash?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingTrash
              ? `“${getEntryTitle(pendingTrash)}” will be moved to trash. You can restore it later.`
              : "This page will be moved to trash."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingTrashId) onDelete?.(pendingTrashId);
              setPendingTrashId(null);
            }}
          >
            Move to trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isMobile) {
    if (!sidebarOpen) return null;
    return (
      <>
        <div onClick={onToggle} className="fixed inset-0 bg-overlay/60 backdrop-blur-sm z-40 md:hidden" />
        <aside className="fixed left-0 top-0 z-50 h-screen max-w-[85vw] shadow-4 md:hidden">{sidebarBody}</aside>
        {trashConfirm}
      </>
    );
  }

  return (
    <>
      <aside className="relative shrink-0 h-screen">{sidebarBody}</aside>
      {trashConfirm}
    </>
  );
});

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <button
      type="button"
      onClick={item.onClick}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      onDragOver={item.onDragOver}
      onDragLeave={item.onDragLeave}
      onDrop={item.onDrop}
      className={cn(
        "group relative flex h-9 items-center text-sm transition-colors duration-75 active:scale-[0.99]",
        collapsed ? "mx-auto w-9 justify-center overflow-hidden" : "w-full justify-start px-3 overflow-visible",
        item.active || item.dropActive ? "text-accent-strong" : "text-sidebar-foreground/80 hover:text-foreground",
      )}
    >
      <SharpHighlight active={item.active || item.dropActive} compact={collapsed} />
      {collapsed ? (
        <span className="relative z-10 grid size-5 place-items-center">{item.icon}</span>
      ) : (
        <div className="relative z-10 flex w-full min-w-0 items-center gap-3">
          <span className="grid size-5 shrink-0 place-items-center">{item.icon}</span>
          <span className="flex-1 truncate text-left">{item.label}</span>
          {item.shortcut && (
            <span className="text-[11px] text-muted-foreground opacity-0 transition-opacity duration-75 group-hover:opacity-100">
              {item.shortcut}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function SidebarSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center">
        <h3 className="px-2 pb-1 flex-1 text-[11px] font-medium tracking-wide text-muted-foreground select-none">{title}</h3>
        {action ? <div className="pr-1 pb-1">{action}</div> : null}
      </div>
      <ul className="flex flex-col gap-px">{children}</ul>
    </div>
  );
}

function EntryRow({
  title,
  active,
  pinned,
  isLocal = false,
  hasChildren = false,
  expanded = false,
  canManage,
  onClick,
  onTogglePin,
  onDelete,
}: {
  title: string;
  active: boolean;
  pinned: boolean;
  isLocal?: boolean;
  hasChildren?: boolean;
  expanded?: boolean;
  canManage: boolean;
  onClick: () => void;
  onTogglePin?: () => void;
  onDelete?: () => void;
}) {
  const showMenu = canManage && (onTogglePin || onDelete);

  const icon = pinned ? (
    <Pin className="h-3 w-3" />
  ) : hasChildren ? (
    expanded ? (
      <FolderOpen className="h-3 w-3 opacity-60" />
    ) : (
      <Folder className="h-3 w-3 opacity-60" />
    )
  ) : isLocal ? (
    <span title="Local only">
      <Lock className="h-3 w-3 opacity-70" />
    </span>
  ) : (
    <FileText className="h-3 w-3 opacity-60" />
  );

  return (
    <div
      className={cn(
        "group relative flex h-8 w-full min-w-0 items-center text-[13px] transition-colors duration-75 overflow-visible",
        active ? "text-accent-strong" : "text-sidebar-foreground/80 hover:text-foreground",
      )}
    >
      <SharpHighlight active={active} />
      <button
        type="button"
        onClick={onClick}
        className="relative z-10 flex min-w-0 flex-1 items-center px-2"
      >
        <span className="grid size-4 shrink-0 place-items-center mr-2">
          {icon}
        </span>
        <span className="flex-1 truncate text-left group-hover:mask-[linear-gradient(to_right,black_78%,transparent_95%)]">
          {title}
        </span>
      </button>
      {showMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              draggable={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-sidebar-accent data-[state=open]:opacity-100"
              aria-label="Page actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="font-mono text-xs">
            {onTogglePin && (
              <DropdownMenuItem onClick={onTogglePin}>
                {pinned ? (
                  <>
                    <PinOff className="h-3.5 w-3.5 mr-2" /> unpin
                  </>
                ) : (
                  <>
                    <Pin className="h-3.5 w-3.5 mr-2" /> pin
                  </>
                )}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> move to trash
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function PlusNavIcon() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-sidebar-foreground/10 transition-transform duration-200 ease-out group-hover:-rotate-3 group-hover:scale-110 group-active:rotate-6 group-active:scale-95">
      <Plus className="h-3 w-3" />
    </span>
  );
}
