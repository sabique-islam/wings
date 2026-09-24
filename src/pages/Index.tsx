import { Fragment, useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { fetchEntries, syncWorkspaceEntries, updateEntry, updateEntryTitle, moveEntry, saveEntryOrder, deleteEntry, togglePin, getBreadcrumbTrail, Entry, getEntryTitle, findReusableBlankDraft, normalizeEntryTitle, ShareRole } from "@/lib/journal";
import type { CollectionInfo } from "@/lib/collections";
import {
  addPagesToCollection,
  createCollection,
  deleteCollection,
  fetchCollections,
  updateCollection,
} from "@/lib/collectionStore";
import { reorderSiblings, type DropPlacement } from "@/lib/pageOrder";
import { saveDraft, saveDraftThrottled, getDraft, clearDraft, queuePendingWrite, getPendingWrites, clearPendingWrite, hydrateDraftCache } from "@/lib/draftCache";
import { readCachedEntries, readWorkspaceMeta, mergeCachedEntries, putCachedEntry, putWorkspaceMeta, readCachedCollections } from "@/lib/localStore";
import { forgetLinkIndex, hydrateLinkIndex, reindexEntries, scheduleLinkIndex } from "@/lib/linkIndex";
import { mirrorEntryToVault } from "@/lib/vault/write";
import { appendMarkdown, payloadFromMarkdown } from "@/lib/entryContent";
import { deleteBlocksAtPositions } from "@/components/BlockEditor/blockUtils";
import { isFullPayload, isSameEditorPayload, requestEditorSerialize, type EditorChangePayload } from "@/lib/editorPayload";
import { applyDraftToEntry, resolveInitialEditorContent, shouldBlockEmptySave, shouldReplayPendingWrite } from "@/lib/editorContent";
import { getEntryVersion, recordEntryVersion } from "@/lib/entryVersions";
import {
  getCanonicalContent,
  hydrateLocalEntries,
  isLocalEntry,
  persistEntryBody,
  promoteEntryToCloud,
  type ContentStorage,
  type DefaultContentStorage,
} from "@/lib/localContent";
import {
  canCreateLocalStorage,
  executeCreatePage,
  isVaultConnected,
  mustUseCloudStorage,
  resolveStorageChoice,
} from "@/lib/pageCreation";
import { updateUserPreferences } from "@/lib/profile";
import { StorageChoiceDialog } from "@/components/StorageChoiceDialog";
import { isTypingTarget, isEditorFocused } from "@/lib/keyboard";

import { JournalSidebar } from "@/components/JournalSidebar";
import { PageTabBar } from "@/components/PageTabBar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { JournalEditor } from "@/components/JournalEditor";
import { QuickSwitcher } from "@/components/QuickSwitcher";
import { CommandPalette } from "@/components/CommandPalette";
import { CollectionEditorDialog } from "@/components/CollectionEditorDialog";
import { CollectionView } from "@/components/CollectionView";
import { TrashView } from "@/components/TrashView";
import { KeyboardPalette } from "@/components/KeyboardPalette";
import { GraphView } from "@/components/GraphView";
import { SettingsPanel } from "@/components/SettingsPanel";
import { AIAssistant } from "@/components/AIAssistant";
import { LectureModePanel } from "@/components/LectureModePanel";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LoadingScreen } from "@/components/ui/spinner";
import { Seo } from "@/components/Seo";
import { playUiSound } from "@/lib/uiSounds";
import {
  closeTab,
  cycleTab,
  emptyPageTabs,
  findTab,
  isPageTabsEnabled,
  openTab,
  PAGE_TABS_ENABLED_EVENT,
  popClosedTab,
  pruneMissingTabs,
  readPageTabs,
  rememberClosedTab,
  tabFromRoute,
  tabKey,
  writePageTabs,
  type PageTab,
  type PageTabsState,
} from "@/lib/pageTabs";
import {
  emptyPageSplitState,
  focusPaneTab,
  moveTabToPane,
  moveTabWithinPane,
  normalizePageSplitState,
  readPageSplitState,
  removeTabsFromPanes,
  setPaneSizes,
  splitTabOnto,
  writePageSplitState,
  MAX_SPLIT_PANES,
  type PageSplitState,
} from "@/lib/pageSplits";

function resolveEntryOwnerId(
  parentId: string | undefined,
  userId: string,
  entries: Entry[],
  roleMap: Record<string, ShareRole>,
): string {
  if (!parentId) return userId;
  const parent = entries.find((e) => e.id === parentId);
  const role = roleMap[parentId];
  if (parent && role && role !== "owner") return parent.user_id;
  return userId;
}

type EditorChain = {
  focus: () => EditorChain;
  insertContent: (content: unknown) => EditorChain;
  run: () => void;
};

type MountedEditor = {
  chain: () => EditorChain;
};

function mountedEditor(): MountedEditor | undefined {
  return (window as { __nw_editor?: MountedEditor }).__nw_editor;
}

/** Insert a link to `entryId` at the editor's cursor, if an editor is mounted. */
function insertPageLink(entryId: string): void {
  mountedEditor()
    ?.chain()
    .focus()
    .insertContent({ type: "pageRef", attrs: { pageId: entryId } })
    .insertContent(" ")
    .run();
}

/** Insert a live preview card for `entryId`, the block form of a page link. */
function insertPageEmbed(entryId: string, title: string): void {
  mountedEditor()
    ?.chain()
    .focus()
    .insertContent({ type: "pageEmbed", attrs: { pageId: entryId, title } })
    .run();
}

function entryErrorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  if (/jwt|session|auth/i.test(msg)) return "Session expired — sign in again.";
  if (/row-level security|42501/i.test(msg)) return "Permission denied — you may not have access to create this page.";
  if (/network|fetch/i.test(msg)) return "Network error — check your connection.";
  return msg || "Something went wrong. Try again.";
}

export default function Index() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeId, username, collectionId } = useParams<{
    id?: string;
    username?: string;
    collectionId?: string;
  }>();
  const basePath = username ? `/${username}` : location.pathname.startsWith("/app") ? "/app" : "";
  const isTrashRoute = location.pathname === `${basePath}/trash` || location.pathname === "/trash";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [collectionDraft, setCollectionDraft] = useState<CollectionInfo | null>(null);
  const [roleMap, setRoleMap] = useState<Record<string, ShareRole>>({});
  const [activeId, setActiveIdRaw] = useState<string | null>(routeId ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 768 : true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("nw:sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [tabsEnabled, setTabsEnabled] = useState(isPageTabsEnabled);
  const [tabState, setTabState] = useState<PageTabsState>(emptyPageTabs);
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;
  const [splitState, setSplitState] = useState<PageSplitState>(emptyPageSplitState);
  const splitStateRef = useRef(splitState);
  splitStateRef.current = splitState;
  const nextPaneIdRef = useRef(1);
  const [restoredTabsForUser, setRestoredTabsForUser] = useState<string | null>(null);
  const closedTabsRef = useRef<PageTab[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [lectureOpen, setLectureOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Distinct from `loading`: the cached paint clears `loading` early, but a
  // page missing from the mirror is not yet proof the page is gone.
  const [serverSynced, setServerSynced] = useState(false);
  const [saveStatuses, setSaveStatuses] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({});
  useEffect(() => {
    try {
      localStorage.setItem("nw:sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* private browsing */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onTabs = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setTabsEnabled(typeof detail === "boolean" ? detail : isPageTabsEnabled());
    };
    window.addEventListener(PAGE_TABS_ENABLED_EVENT, onTabs);
    return () => window.removeEventListener(PAGE_TABS_ENABLED_EVENT, onTabs);
  }, []);

  useEffect(() => {
    if (!userId) {
      setTabState(emptyPageTabs());
      setSplitState(emptyPageSplitState());
      setRestoredTabsForUser(null);
      return;
    }
    setTabState(readPageTabs(userId));
    setSplitState(readPageSplitState(userId));
    setRestoredTabsForUser(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || !tabsEnabled || restoredTabsForUser !== userId) return;
    writePageTabs(userId, tabState);
  }, [userId, tabsEnabled, tabState, restoredTabsForUser]);

  useEffect(() => {
    if (!tabsEnabled || restoredTabsForUser !== userId) return;
    setSplitState((current) =>
      normalizePageSplitState(current, tabState.tabs, tabState.activeKey),
    );
  }, [tabsEnabled, tabState.tabs, tabState.activeKey, restoredTabsForUser, userId]);

  useEffect(() => {
    if (!userId || !tabsEnabled || restoredTabsForUser !== userId) return;
    writePageSplitState(userId, splitState);
  }, [userId, tabsEnabled, splitState, restoredTabsForUser]);

  const debounceRefs = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const titleDebounceRefs = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savedFlashRefs = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const creatingRef = useRef(false);
  const pendingPayloadsRef = useRef(new Map<string, EditorChangePayload>());
  const setEntrySaveStatus = useCallback(
    (entryId: string, status: "idle" | "saving" | "saved" | "error") => {
      setSaveStatuses((current) =>
        current[entryId] === status ? current : { ...current, [entryId]: status },
      );
    },
    [],
  );
  const [sharedEntryIds, setSharedEntryIds] = useState<Set<string>>(() => new Set());
  const [defaultStorage, setDefaultStorage] = useState<DefaultContentStorage>("cloud");
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const pendingCreateRef = useRef<{
    ownerId: string;
    parentId?: string | null;
    initialContent?: string;
    title?: string;
    onCreated?: (entry: Entry) => void;
    activate?: boolean;
  } | null>(null);
  const SAVE_DEBOUNCE_MS = 1500;
  // Read by debounced save work so the callbacks feeding the editor keep a
  // stable identity across the state updates each save produces.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    return () => {
      debounceRefs.current.forEach(clearTimeout);
      titleDebounceRefs.current.forEach(clearTimeout);
      savedFlashRefs.current.forEach(clearTimeout);
    };
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdRaw(id);
    navigate(id ? `${basePath}/n/${id}` : basePath || "/app");
  }, [navigate, basePath]);

  const openTrash = useCallback(() => {
    setActiveIdRaw(null);
    navigate(`${basePath}/trash`);
  }, [navigate, basePath]);

  const openCollection = useCallback((id: string) => {
    setActiveIdRaw(null);
    navigate(`${basePath}/c/${id}`);
  }, [navigate, basePath]);

  const applyTab = useCallback((tab: PageTab | null) => {
    if (!tab) {
      setActiveId(null);
      return;
    }
    if (tab.kind === "page") setActiveId(tab.id);
    else if (tab.kind === "collection") openCollection(tab.id);
    else openTrash();
  }, [setActiveId, openCollection, openTrash]);

  const commitTabState = useCallback((next: PageTabsState, navigateIfActiveChanged = true) => {
    const prev = tabStateRef.current;
    setTabState(next);
    if (!navigateIfActiveChanged) return;
    if (prev.activeKey === next.activeKey) return;
    applyTab(findTab(next, next.activeKey));
  }, [applyTab]);

  const closeOpenTab = useCallback((tab: PageTab) => {
    const prev = tabStateRef.current;
    const key = tabKey(tab);
    closedTabsRef.current = rememberClosedTab(closedTabsRef.current, tab);
    const nextSplit = removeTabsFromPanes(splitStateRef.current, new Set([key]));
    setSplitState(nextSplit);
    const closed = closeTab(prev, key);
    const focusedPane =
      nextSplit.panes.find((pane) => pane.id === nextSplit.activePaneId) ?? nextSplit.panes[0];
    const next = prev.activeKey === key
      ? { ...closed, activeKey: focusedPane?.activeKey ?? closed.activeKey }
      : closed;
    commitTabState(next);
  }, [commitTabState]);

  const selectTabInPane = useCallback((paneId: string, tab: PageTab) => {
    const key = tabKey(tab);
    setSplitState((current) => focusPaneTab(current, paneId, key));
    setTabState((current) => ({ ...current, activeKey: key }));
    applyTab(tab);
  }, [applyTab]);

  const focusPane = useCallback((paneId: string) => {
    const pane = splitStateRef.current.panes.find((item) => item.id === paneId);
    if (!pane || paneId === splitStateRef.current.activePaneId) return;
    const tab = findTab(tabStateRef.current, pane.activeKey);
    if (!tab) return;
    selectTabInPane(paneId, tab);
  }, [selectTabInPane]);

  const dropTabOnTab = useCallback(
    (draggedKey: string, sourcePaneId: string, targetKey: string) => {
      const current = splitStateRef.current;
      const targetPane = current.panes.find((pane) => pane.tabKeys.includes(targetKey));
      if (!targetPane) return;
      let next: PageSplitState;
      if (sourcePaneId === targetPane.id) {
        if (current.panes.length >= MAX_SPLIT_PANES) {
          toast.info(`You can open up to ${MAX_SPLIT_PANES} split panes`);
          return;
        }
        let newPaneId = `pane-${nextPaneIdRef.current++}`;
        while (current.panes.some((pane) => pane.id === newPaneId)) {
          newPaneId = `pane-${nextPaneIdRef.current++}`;
        }
        next = splitTabOnto(current, draggedKey, targetKey, newPaneId);
      } else {
        next = moveTabToPane(current, draggedKey, targetPane.id, targetKey);
      }
      if (next === current) return;
      setSplitState(next);
      const tab = findTab(tabStateRef.current, draggedKey);
      if (tab) {
        setTabState((state) => ({ ...state, activeKey: draggedKey }));
        applyTab(tab);
      }
    },
    [applyTab],
  );

  const closeOtherTabsInPane = useCallback((paneId: string, tab: PageTab) => {
    const key = tabKey(tab);
    const pane = splitStateRef.current.panes.find((item) => item.id === paneId);
    if (!pane) return;
    const removedKeys = new Set(pane.tabKeys.filter((item) => item !== key));
    let nextTabs = tabStateRef.current;
    for (const removedKey of removedKeys) {
      const removed = findTab(nextTabs, removedKey);
      if (removed) closedTabsRef.current = rememberClosedTab(closedTabsRef.current, removed);
      nextTabs = closeTab(nextTabs, removedKey);
    }
    setSplitState(removeTabsFromPanes(splitStateRef.current, removedKeys));
    commitTabState({ ...nextTabs, activeKey: key });
  }, [commitTabState]);

  const closeTabsToRightInPane = useCallback((paneId: string, tab: PageTab) => {
    const key = tabKey(tab);
    const pane = splitStateRef.current.panes.find((item) => item.id === paneId);
    const index = pane?.tabKeys.indexOf(key) ?? -1;
    if (!pane || index < 0) return;
    const removedKeys = new Set(pane.tabKeys.slice(index + 1));
    let nextTabs = tabStateRef.current;
    for (const removedKey of removedKeys) {
      const removed = findTab(nextTabs, removedKey);
      if (removed) closedTabsRef.current = rememberClosedTab(closedTabsRef.current, removed);
      nextTabs = closeTab(nextTabs, removedKey);
    }
    setSplitState(removeTabsFromPanes(splitStateRef.current, removedKeys));
    commitTabState(nextTabs);
  }, [commitTabState]);

  useEffect(() => {
    if (isTrashRoute || collectionId) {
      setActiveIdRaw(null);
      return;
    }
    setActiveIdRaw(routeId ?? null);
  }, [routeId, collectionId, isTrashRoute]);

  useEffect(() => {
    if (!tabsEnabled) return;
    const tab = tabFromRoute({
      pageId: activeId,
      collectionId: collectionId ?? null,
      trash: isTrashRoute,
    });
    setTabState((prev) => {
      if (!tab) return prev.activeKey == null ? prev : { ...prev, activeKey: null };
      return openTab(prev, tab);
    });
  }, [tabsEnabled, activeId, collectionId, isTrashRoute]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("default_content_storage")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return;
      const pref = data?.default_content_storage;
      if (pref === "local" || pref === "ask") setDefaultStorage(pref);
    })();
  }, [userId]);

  // Offline queue: replay failed saves once entries are in memory, drop rows
  // already reflected on the server, and clear the error badge when the active
  // page no longer has outstanding work.
  useEffect(() => {
    if (!userId || loading) return;
    void (async () => {
      const pending = await getPendingWrites();
      if (!pending.length) return;
      for (const pw of pending) {
        const server = entriesRef.current.find((e) => e.id === pw.entryId);
        const serverContent = server ? getCanonicalContent(server) : "";
        if (
          server &&
          isSameEditorPayload(server, {
            markdown: pw.content,
            json: pw.contentJson ?? { type: "doc", content: [] },
          })
        ) {
          clearPendingWrite(pw.entryId);
          clearDraft(pw.entryId);
          continue;
        }
        if (!shouldReplayPendingWrite(serverContent, pw.content)) {
          clearPendingWrite(pw.entryId);
          clearDraft(pw.entryId);
          continue;
        }
        const payload = {
          markdown: pw.content,
          json: pw.contentJson ?? { type: "doc", content: [] },
        };
        try {
          if (server && isLocalEntry(server)) {
            await persistEntryBody(userId, server, entriesRef.current, payload);
            setEntries((prev) =>
              prev.map((e) =>
                e.id === pw.entryId ? { ...e, content: payload.markdown, content_json: payload.json } : e,
              ),
            );
          } else {
            await updateEntry(pw.entryId, payload);
          }
          clearPendingWrite(pw.entryId);
          clearDraft(pw.entryId);
          setEntrySaveStatus(pw.entryId, "idle");
        } catch {
          // Network or auth still down — leave queued for the next session.
        }
      }
    })();
  }, [userId, loading, setEntrySaveStatus]);

  const loadEntries = useCallback(async (opts: { refreshShares?: boolean } = {}) => {
    if (!userId) return;
    const meta = await readWorkspaceMeta(userId);
    const { entries: data, roleMap: roles, sharedEntryIds: shared } = await syncWorkspaceEntries(
      userId,
      meta,
      entriesRef.current,
      { refreshShares: opts.refreshShares },
    );
    const hydrated = await hydrateLocalEntries(userId, data);
    setEntries(hydrated.map((e) => applyDraftToEntry(e, getDraft(e.id))));
    setRoleMap(roles);
    setSharedEntryIds(shared);
    reindexEntries(hydrated);
  }, [userId]);

  const loadCollections = useCallback(async () => {
    if (!userId) return;
    const next = await fetchCollections(userId);
    setCollections(next);
  }, [userId]);

  // Paint from the IndexedDB mirror before the network answers, then reconcile.
  // Share state comes from the same snapshot so the editor knows whether to
  // mount collaboratively without waiting on Supabase.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      await Promise.all([hydrateDraftCache(), hydrateLinkIndex()]);
      const [cached, meta, cachedCollections] = await Promise.all([
        readCachedEntries(userId),
        readWorkspaceMeta(userId),
        readCachedCollections(userId),
      ]);
      if (cancelled) return;
      if (cachedCollections.length > 0) setCollections(cachedCollections);
      if (cached.length > 0 && meta) {
        setEntries(cached.map((e) => applyDraftToEntry(e, getDraft(e.id))));
        setRoleMap(meta.roleMap);
        setSharedEntryIds(new Set(meta.sharedEntryIds));
        setLoading(false);
      }
      try {
        await loadEntries();
        await loadCollections();
      } catch (err) {
        console.error("Failed to fetch entries:", err);
        toast.error("Couldn't load pages", { description: entryErrorMessage(err) });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setServerSynced(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, loadEntries, loadCollections]);

  // Refresh the mirror off the typing path so the next open is instant.
  useEffect(() => {
    if (!userId || loading || entries.length === 0) return;
    const timer = setTimeout(() => {
      void mergeCachedEntries(userId, entries);
      void putWorkspaceMeta({
        userId,
        roleMap,
        sharedEntryIds: Array.from(sharedEntryIds),
        fetchedAt: Date.now(),
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [userId, loading, entries, roleMap, sharedEntryIds]);

  useEffect(() => {
    const handler = (event: Event) => {
      const updated = (event as CustomEvent<Entry[]>).detail;
      if (!Array.isArray(updated)) return;
      setEntries(updated);
      reindexEntries(updated);
    };
    window.addEventListener("nw:vault-synced", handler);
    return () => window.removeEventListener("nw:vault-synced", handler);
  }, []);

  // Saves reach Supabase even when the folder mirror fails, but a folder that
  // has quietly stopped updating is worse than one that never existed.
  useEffect(() => {
    const handler = (event: Event) => {
      toast.error("Vault folder is out of date", {
        description: (event as CustomEvent<string>).detail,
      });
    };
    window.addEventListener("nw:vault-error", handler);
    return () => window.removeEventListener("nw:vault-error", handler);
  }, []);

  const activeEntry = entries.find((e) => e.id === activeId) ?? null;

  // Redirect when URL points to a missing/deleted page
  useEffect(() => {
    if (!serverSynced || !activeId) return;
    if (isTrashRoute || collectionId) return;
    if (activeEntry) return;
    setActiveIdRaw(null);
    navigate(basePath || "/app", { replace: true });
  }, [serverSynced, activeId, activeEntry, basePath, navigate, isTrashRoute, collectionId]);

  useEffect(() => {
    if (!tabsEnabled || !serverSynced) return;
    const prev = tabStateRef.current;
    const next = pruneMissingTabs(prev, {
      pages: new Set(entries.filter((entry) => !entry.deleted_at).map((entry) => entry.id)),
      collections: new Set(collections.map((row) => row.id)),
    });
    if (next === prev) return;
    commitTabState(next, prev.activeKey !== next.activeKey);
  }, [tabsEnabled, serverSynced, entries, collections, commitTabState]);

  const addCreatedEntry = useCallback((entry: Entry, ownerId: string) => {
    setEntries((prev) => [entry, ...prev]);
    setRoleMap((prev) => ({
      ...prev,
      [entry.id]: entry.user_id === ownerId ? "owner" : (prev[entry.id] ?? "editor"),
    }));
  }, []);

  const runCreatePage = useCallback(
    async (opts: {
      ownerId: string;
      parentId?: string | null;
      initialContent?: string;
      title?: string;
      storage: ContentStorage;
      onCreated?: (entry: Entry) => void;
      activate?: boolean;
    }) => {
      if (!userId || !user) return null;
      const vaultConnected = await isVaultConnected(userId);
      const check = canCreateLocalStorage(userId, opts.storage, vaultConnected);
      if (check.ok === false) {
        if (check.reason === "vault") {
          toast.error("Connect a vault folder first", {
            description: "Local pages need a connected vault folder on this device.",
          });
        } else {
          toast.error("Sign in to create local pages");
        }
        return null;
      }
      creatingRef.current = true;
      try {
        const entry = await executeCreatePage({
          userId,
          ownerId: opts.ownerId,
          parentId: opts.parentId,
          initialContent: opts.initialContent,
          title: opts.title,
          storage: opts.storage,
          allEntries: entriesRef.current,
        });
        addCreatedEntry(entry, user.id);
        opts.onCreated?.(entry);
        if (opts.activate) setActiveId(entry.id);
        return entry;
      } catch (err) {
        console.error("Failed to create page:", err);
        toast.error("Couldn't create page", { description: entryErrorMessage(err) });
        return null;
      } finally {
        creatingRef.current = false;
      }
    },
    [userId, user, addCreatedEntry, setActiveId],
  );

  const requestCreatePage = useCallback(
    (opts: {
      ownerId: string;
      parentId?: string | null;
      initialContent?: string;
      title?: string;
      onCreated?: (entry: Entry) => void;
      activate?: boolean;
    }) => {
      if (!user || creatingRef.current) return;
      const parentEntry = opts.parentId
        ? entriesRef.current.find((e) => e.id === opts.parentId)
        : null;
      const forceCloud = mustUseCloudStorage(parentEntry, roleMap, opts.ownerId);
      const resolved = resolveStorageChoice({
        userDefault: defaultStorage,
        parentEntry,
        forceCloud,
      });
      if (resolved === "ask") {
        pendingCreateRef.current = opts;
        setStorageDialogOpen(true);
        return;
      }
      void runCreatePage({ ...opts, storage: resolved });
    },
    [user, defaultStorage, roleMap, runCreatePage],
  );

  const handleStorageChoiceConfirm = useCallback(
    (storage: ContentStorage, remember: DefaultContentStorage | null) => {
      if (remember && userId) {
        setDefaultStorage(remember);
        void updateUserPreferences(userId, { default_content_storage: remember });
      }
      const pending = pendingCreateRef.current;
      pendingCreateRef.current = null;
      if (!pending) return;
      void runCreatePage({ ...pending, storage });
    },
    [userId, runCreatePage],
  );

  const handleNew = useCallback(async () => {
    if (!user || creatingRef.current) return;

    const existing = findReusableBlankDraft(entries, user.id, null);
    if (existing) {
      setActiveId(existing.id);
      return;
    }

    requestCreatePage({ ownerId: user.id, activate: true });
    playUiSound("tick");
  }, [user, entries, setActiveId, requestCreatePage]);

  const handleNewSubpage = useCallback(async (parentId: string) => {
    if (!user || creatingRef.current) return;

    const ownerId = resolveEntryOwnerId(parentId, user.id, entries, roleMap);
    const existing = findReusableBlankDraft(entries, ownerId, parentId);
    if (existing) {
      setActiveId(existing.id);
      return;
    }

    requestCreatePage({ ownerId, parentId, activate: true });
  }, [user, entries, roleMap, setActiveId, requestCreatePage]);

  const handleNewSubpageWithTitle = useCallback(async (parentId: string, title: string) => {
    if (!user || creatingRef.current) return;
    const name = normalizeEntryTitle(title);
    if (!name) return;
    const ownerId = resolveEntryOwnerId(parentId, user.id, entries, roleMap);
    // Name belongs in `entries.title`. A leading `# title` heading left the
    // title field on Untitled with an H1 in the body.
    requestCreatePage({
      ownerId,
      parentId,
      title: name,
      onCreated: (entry) => insertPageLink(entry.id),
    });
  }, [user, entries, roleMap, requestCreatePage]);

  const handleEntryCreated = useCallback((entry: Entry) => {
    if (!user) return;
    addCreatedEntry(entry, user.id);
  }, [user, addCreatedEntry]);

  const handleChange = useCallback((entryId: string, payload: EditorChangePayload) => {
    saveDraftThrottled(entryId, { markdown: payload.markdown, json: payload.json });
    scheduleLinkIndex(entryId, payload.json, payload.markdown);
    pendingPayloadsRef.current.set(entryId, payload);

    // While Yjs collab is live, Hocuspocus owns persistence — skip full-doc UPDATE.
    const entryCollabEnabled =
      sharedEntryIds.has(entryId) && Boolean(import.meta.env.VITE_COLLAB_URL);
    if (entryCollabEnabled) return;

    const pendingTimer = debounceRefs.current.get(entryId);
    if (pendingTimer) clearTimeout(pendingTimer);
    const timer = setTimeout(async () => {
      // Typing emits JSON only, so ask the editor for markdown now — `content`
      // and `content_json` must come from one serialize of one document.
      const pending = pendingPayloadsRef.current.get(entryId);
      const toSave = requestEditorSerialize(entryId) ?? (isFullPayload(pending) ? pending : null);
      if (!toSave) return;
      pendingPayloadsRef.current.set(entryId, toSave);
      const existing = entriesRef.current.find((e) => e.id === entryId);
      const existingContent = existing ? getCanonicalContent(existing) : "";
      if (existing && shouldBlockEmptySave(existingContent, toSave.markdown)) {
        console.warn("[wings] blocked empty autosave over existing content");
        return;
      }
      if (existing && isSameEditorPayload(existing, toSave)) {
        pendingPayloadsRef.current.delete(entryId);
        return;
      }
      setEntrySaveStatus(entryId, "saving");
      // Durable locally before the network is attempted, so a refresh while the
      // request is in flight still shows what was typed.
      if (userId && existing) {
        void putCachedEntry(userId, { ...existing, content: toSave.markdown, content_json: toSave.json });
      }
      try {
        if (existing && isLocalEntry(existing)) {
          await persistEntryBody(userId!, existing, entriesRef.current, toSave);
        } else {
          await updateEntry(entryId, toSave);
        }
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, content: toSave.markdown, content_json: toSave.json }
              : e,
          ),
        );
        clearDraft(entryId);
        clearPendingWrite(entryId);
        pendingPayloadsRef.current.delete(entryId);
        if (!existing || !isLocalEntry(existing)) {
          void recordEntryVersion(entryId, userId ?? null, {
            content: toSave.markdown,
            content_json: toSave.json,
          });
        }
        setEntrySaveStatus(entryId, "saved");
        if (userId && existing && !isLocalEntry(existing)) {
          void mirrorEntryToVault(
            userId,
            { ...existing, content: toSave.markdown, content_json: toSave.json },
            entriesRef.current,
          );
        }
        const savedTimer = savedFlashRefs.current.get(entryId);
        if (savedTimer) clearTimeout(savedTimer);
        savedFlashRefs.current.set(
          entryId,
          setTimeout(() => setEntrySaveStatus(entryId, "idle"), 1500),
        );
      } catch {
        queuePendingWrite(entryId, { markdown: toSave.markdown, json: toSave.json });
        setEntrySaveStatus(entryId, "error");
      }
    }, SAVE_DEBOUNCE_MS);
    debounceRefs.current.set(entryId, timer);
  }, [sharedEntryIds, userId, setEntrySaveStatus]);

  // Turn selected blocks into a sub-page. The editor has already removed them
  // and left the cursor where they were, so the link lands in their place.
  useEffect(() => {
    const handler = (event: Event) => {
      const { title, markdown } = (event as CustomEvent<{ title: string; markdown: string }>).detail;
      if (!user || !activeId) return;
      void (async () => {
        try {
          const ownerId = resolveEntryOwnerId(activeId, user.id, entriesRef.current, roleMap);
          requestCreatePage({
            ownerId,
            parentId: activeId,
            title,
            initialContent: markdown,
            onCreated: (entry) => {
              insertPageLink(entry.id);
              toast.success(`Moved into “${title}”`);
            },
          });
        } catch (err) {
          console.error("Failed to turn blocks into a page:", err);
          toast.error("Couldn't create the page", { description: entryErrorMessage(err) });
        }
      })();
    };
    window.addEventListener("nw:turnIntoPage", handler);
    return () => window.removeEventListener("nw:turnIntoPage", handler);
  }, [user, activeId, roleMap, requestCreatePage]);

  // The action menu stashes what it wants moved; the page picker supplies where.
  const pendingBlockMoveRef = useRef<{ markdown: string; positions: number[] } | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      pendingBlockMoveRef.current = (
        event as CustomEvent<{ markdown: string; positions: number[] }>
      ).detail;
    };
    window.addEventListener("nw:moveBlocksToPage", handler);
    return () => window.removeEventListener("nw:moveBlocksToPage", handler);
  }, []);

  const handleMoveBlocksToPage = useCallback(async (target: Entry) => {
    const move = pendingBlockMoveRef.current;
    pendingBlockMoveRef.current = null;
    if (!move) return;
    const nextMarkdown = appendMarkdown(getCanonicalContent(target), move.markdown);
    // Appending can only grow the page, so anything shorter means the extraction
    // went wrong and this write would destroy the destination.
    if (shouldBlockEmptySave(getCanonicalContent(target), nextMarkdown)) {
      console.warn("[wings] blocked empty block move over existing content");
      toast.error("Couldn't move those blocks");
      return;
    }
    const payload = payloadFromMarkdown(nextMarkdown);
    try {
      if (isLocalEntry(target)) {
        await persistEntryBody(userId!, target, entriesRef.current, payload);
      } else {
        await updateEntry(target.id, payload);
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === target.id ? { ...e, content: payload.markdown, content_json: payload.json } : e,
        ),
      );
      if (userId) {
        void putCachedEntry(userId, {
          ...target,
          content: payload.markdown,
          content_json: payload.json,
        });
      }
      // Only now is it safe to drop them from the page they came from.
      const editor = (window as { __nw_editor?: Parameters<typeof deleteBlocksAtPositions>[0] }).__nw_editor;
      if (editor) deleteBlocksAtPositions(editor, move.positions);
      toast.success(`Moved to “${getEntryTitle(target)}”`);
    } catch (err) {
      console.error("Failed to move blocks:", err);
      toast.error("Couldn't move those blocks", { description: entryErrorMessage(err) });
    }
  }, [userId]);

  const handleRestoreVersion = useCallback(async (entryId: string, versionId: string) => {
    const current = entriesRef.current.find((e) => e.id === entryId);
    if (!current) return;
    if (isLocalEntry(current)) {
      toast.error("Version history isn't available for local pages");
      return;
    }
    try {
      const snapshot = await getEntryVersion(versionId);
      if (!snapshot) {
        toast.error("That version is no longer available");
        return;
      }
      if (shouldBlockEmptySave(getCanonicalContent(current), snapshot.content)) {
        toast.error("That snapshot is empty — restoring it would clear the page");
        return;
      }
      const payload = snapshot.content_json
        ? { markdown: snapshot.content, json: snapshot.content_json }
        : payloadFromMarkdown(snapshot.content);
      await updateEntry(entryId, payload);
      // A draft from before the restore would immediately overwrite it.
      clearDraft(entryId);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId ? { ...e, content: payload.markdown, content_json: payload.json } : e,
        ),
      );
      if (userId) {
        void putCachedEntry(userId, {
          ...current,
          content: payload.markdown,
          content_json: payload.json,
        });
      }
      const editor = (window as { __nw_editor?: Parameters<typeof deleteBlocksAtPositions>[0] })
        .__nw_editor;
      if (entryId === activeId && editor) {
        editor.commands.setContent(resolveInitialEditorContent(payload.markdown, payload.json));
      }
      toast.success("Restored earlier version");
    } catch (err) {
      console.error("Failed to restore version:", err);
      toast.error("Couldn't restore that version", { description: entryErrorMessage(err) });
    }
  }, [activeId, userId]);

  const handleTitleChange = useCallback((entryId: string, title: string) => {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, title } : e)));
    const pendingTimer = titleDebounceRefs.current.get(entryId);
    if (pendingTimer) clearTimeout(pendingTimer);
    titleDebounceRefs.current.set(
      entryId,
      setTimeout(async () => {
        try {
          await updateEntryTitle(entryId, title);
        } catch {
          toast.error("Couldn't save title");
        }
      }, 500),
    );
  }, []);

  const handleMovePage = useCallback((draggedId: string, parentId: string | null) => {
    const current = entriesRef.current.find((e) => e.id === draggedId);
    if (!current || current.parent_id === parentId) return;
    setEntries((prev) => prev.map((e) => (e.id === draggedId ? { ...e, parent_id: parentId } : e)));
    void moveEntry(draggedId, parentId).catch((err) => {
      console.error("Failed to move page:", err);
      toast.error("Couldn't move that page", { description: entryErrorMessage(err) });
      setEntries((prev) => prev.map((e) => (e.id === draggedId ? current : e)));
    });
  }, []);

  const handleReorderPages = useCallback(
    (draggedId: string, targetId: string, placement: DropPlacement) => {
      const entries = entriesRef.current;
      const target = entries.find((e) => e.id === targetId);
      const dragged = entries.find((e) => e.id === draggedId);
      // Favorites and pages are separate lists; moving between them is what the
      // pin button is for.
      if (!target || !dragged || target.pinned !== dragged.pinned) return;

      // Dropping beside a page in another branch adopts that page's parent too,
      // otherwise the row would jump straight back to where it came from.
      const parentId = target.parent_id;
      const siblings = entries.filter(
        (e) => e.id === draggedId || (e.parent_id === parentId && e.pinned === target.pinned),
      );
      const order = reorderSiblings(siblings, draggedId, targetId, placement);
      if (order.length === 0) return;

      const byId = new Map(order.map((row) => [row.id, row.sort_order]));
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id === draggedId) return { ...e, parent_id: parentId, sort_order: byId.get(e.id) ?? e.sort_order };
          return byId.has(e.id) ? { ...e, sort_order: byId.get(e.id)! } : e;
        }),
      );

      const persist = async () => {
        if (dragged.parent_id !== parentId) await moveEntry(draggedId, parentId);
        await saveEntryOrder(order);
      };
      void persist().catch((err) => {
        console.error("Failed to reorder pages:", err);
        toast.error("Couldn't save the new order", { description: entryErrorMessage(err) });
        void loadEntries();
      });
    },
    [loadEntries],
  );

  // Draft merge for the open page: runs when loading finishes and again after
  // server sync so a mid-flight `loadEntries` cannot leave local work unapplied.
  useEffect(() => {
    if (!activeId || loading) return;
    const draft = getDraft(activeId);
    if (draft == null) return;
    setEntries((prev) =>
      prev.map((e) => (e.id === activeId ? applyDraftToEntry(e, draft) : e)),
    );
  }, [activeId, loading, serverSynced]);

  useEffect(() => {
    const onSharesChanged = () => {
      void loadEntries({ refreshShares: true });
    };
    window.addEventListener("nw:shares-changed", onSharesChanged);
    return () => window.removeEventListener("nw:shares-changed", onSharesChanged);
  }, [loadEntries]);

  // Cross-user: permission rows push via Realtime (RLS-scoped). Debounce so a
  // burst of share edits collapses into one workspace refresh.
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void loadEntries({ refreshShares: true });
      }, 150);
    };
    const channel = supabase
      .channel(`entry-shares:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entry_shares" },
        scheduleRefresh,
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, loadEntries]);

  const flushEditor = useCallback((entryId: string) => {
    const payload = requestEditorSerialize(entryId);
    if (!payload) return;
    pendingPayloadsRef.current.set(entryId, payload);
    saveDraft(entryId, payload);
  }, []);

  const visibleEntryIds = useCallback(() => {
    const ids = new Set<string>(pendingPayloadsRef.current.keys());
    for (const pane of splitStateRef.current.panes) {
      const tab = findTab(tabStateRef.current, pane.activeKey);
      if (tab?.kind === "page") ids.add(tab.id);
    }
    if (activeId) ids.add(activeId);
    return ids;
  }, [activeId]);

  const flushVisibleEditors = useCallback(() => {
    visibleEntryIds().forEach(flushEditor);
  }, [flushEditor, visibleEntryIds]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushVisibleEditors();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", flushVisibleEditors);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", flushVisibleEditors);
    };
  }, [flushVisibleEditors]);

  useEffect(() => {
    const onCollabFlush = async () => {
      for (const entryId of visibleEntryIds()) {
        if (!sharedEntryIds.has(entryId)) continue;
        flushEditor(entryId);
        const toSave = pendingPayloadsRef.current.get(entryId);
        if (!isFullPayload(toSave)) continue;
        const existing = entriesRef.current.find((e) => e.id === entryId);
        if (existing && isLocalEntry(existing)) continue;
        if (existing && shouldBlockEmptySave(getCanonicalContent(existing), toSave.markdown)) {
          console.warn("[wings] blocked empty collab flush over existing content");
          continue;
        }
        try {
          await updateEntry(entryId, toSave);
          clearDraft(entryId);
          pendingPayloadsRef.current.delete(entryId);
          void recordEntryVersion(entryId, userId ?? null, {
            content: toSave.markdown,
            content_json: toSave.json,
          });
        } catch {
          queuePendingWrite(entryId, { markdown: toSave.markdown, json: toSave.json });
        }
      }
    };
    window.addEventListener("nw:collab-flush", onCollabFlush);
    return () => window.removeEventListener("nw:collab-flush", onCollabFlush);
  }, [flushEditor, sharedEntryIds, userId, visibleEntryIds]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteEntry(id);
      const removed = new Set<string>();
      const collect = (pid: string) => {
        removed.add(pid);
        entriesRef.current.filter((e) => e.parent_id === pid).forEach((e) => collect(e.id));
      };
      collect(id);
      removed.forEach((entryId) => {
        forgetLinkIndex(entryId);
        const saveTimer = debounceRefs.current.get(entryId);
        if (saveTimer) clearTimeout(saveTimer);
        const titleTimer = titleDebounceRefs.current.get(entryId);
        if (titleTimer) clearTimeout(titleTimer);
        debounceRefs.current.delete(entryId);
        titleDebounceRefs.current.delete(entryId);
        pendingPayloadsRef.current.delete(entryId);
      });
      setEntries((prev) => prev.filter((e) => !removed.has(e.id)));
      if (tabsEnabled) {
        let next = tabStateRef.current;
        for (const pid of removed) {
          const key = tabKey({ kind: "page", id: pid });
          const tab = findTab(next, key);
          if (!tab) continue;
          closedTabsRef.current = rememberClosedTab(closedTabsRef.current, tab);
          next = closeTab(next, key);
        }
        commitTabState(next, Boolean(activeId && removed.has(activeId)));
      } else if (activeId && removed.has(activeId)) {
        setActiveId(null);
      }
    } catch (err) {
      console.error("Failed to delete page:", err);
      toast.error("Couldn't delete page", { description: entryErrorMessage(err) });
    }
  }, [activeId, setActiveId, tabsEnabled, commitTabState]);

  const handleTogglePin = useCallback(async (id: string, pinned: boolean) => {
    try {
      await togglePin(id, pinned);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, pinned } : e)));
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      toast.error("Couldn't update pin", { description: entryErrorMessage(err) });
    }
  }, []);

  const handleSaveCollection = useCallback(async (info: CollectionInfo) => {
    if (!userId) return;
    try {
      const saved = info.id
        ? await updateCollection(userId, info.id, {
            name: info.name,
            rules: info.rules,
            allowList: info.allowList,
          })
        : await createCollection(userId, {
            name: info.name,
            rules: info.rules,
            allowList: info.allowList,
          });
      setCollections((prev) => {
        if (prev.some((row) => row.id === saved.id)) {
          return prev.map((row) => (row.id === saved.id ? saved : row));
        }
        return [...prev, saved];
      });
      setCollectionDraft(null);
      if (!info.id) openCollection(saved.id);
    } catch (err) {
      toast.error("Couldn't save collection", { description: entryErrorMessage(err) });
    }
  }, [userId, openCollection]);

  const handleDeleteCollection = useCallback(async (id: string) => {
    if (!userId) return;
    try {
      await deleteCollection(userId, id);
      setCollections((prev) => prev.filter((row) => row.id !== id));
      if (tabsEnabled) {
        const key = tabKey({ kind: "collection", id });
        const tab = findTab(tabStateRef.current, key);
        if (tab) {
          closedTabsRef.current = rememberClosedTab(closedTabsRef.current, tab);
          commitTabState(closeTab(tabStateRef.current, key), collectionId === id);
        } else if (collectionId === id) {
          navigate(basePath || "/app");
        }
      } else if (collectionId === id) {
        navigate(basePath || "/app");
      }
    } catch (err) {
      toast.error("Couldn't delete collection", { description: entryErrorMessage(err) });
    }
  }, [userId, collectionId, navigate, basePath, tabsEnabled, commitTabState]);

  const handleAddToCollection = useCallback(async (id: string, entryId: string) => {
    if (!userId) return;
    const current = collections.find((row) => row.id === id);
    if (!current) return;
    try {
      const saved = await addPagesToCollection(userId, current, [entryId]);
      setCollections((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
    } catch (err) {
      toast.error("Couldn't add to collection", { description: entryErrorMessage(err) });
    }
  }, [userId, collections]);

  const handleUpdateEntry = useCallback((updated: Entry) => {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }, []);

  const handlePromoteToCloud = useCallback(
    async (entryId: string, payload: EditorChangePayload) => {
      if (!userId || !isFullPayload(payload)) return;
      const existing = entriesRef.current.find((e) => e.id === entryId);
      if (!existing || !isLocalEntry(existing)) return;
      try {
        const promoted = await promoteEntryToCloud(userId, existing, payload);
        setEntries((prev) => prev.map((e) => (e.id === entryId ? promoted : e)));
        toast.success("Page moved to the cloud");
      } catch (err) {
        console.error("Failed to promote page:", err);
        toast.error("Couldn't move page to the cloud", { description: entryErrorMessage(err) });
        throw err;
      }
    },
    [userId],
  );

  const toggleSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen((s) => !s);
    } else {
      setSidebarCollapsed((c) => !c);
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (isTypingTarget(e.target) || isEditorFocused()) {
        if (e.key === "n" || e.key === "N") return;
        if (e.key === "b" || e.key === "B") return;
      }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); handleNew(); }
      if (e.key === "b" || e.key === "B") { e.preventDefault(); toggleSidebar(); }
      if (e.key === "/") {
        e.preventDefault();
        if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(true);
        else setSidebarCollapsed(false);
        window.dispatchEvent(new CustomEvent("nw:search"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleNew, toggleSidebar]);

  useEffect(() => {
    if (!tabsEnabled) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "Tab") {
        e.preventDefault();
        const next = cycleTab(tabStateRef.current, e.shiftKey ? -1 : 1);
        commitTabState(next);
        return;
      }
      if (e.shiftKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        const popped = popClosedTab(closedTabsRef.current);
        closedTabsRef.current = popped.stack;
        if (!popped.tab) return;
        const next = openTab(tabStateRef.current, popped.tab);
        setTabState(next);
        applyTab(popped.tab);
        return;
      }
      if (e.shiftKey && (e.key === "[" || e.key === "{")) {
        e.preventDefault();
        commitTabState(cycleTab(tabStateRef.current, -1));
        return;
      }
      if (e.shiftKey && (e.key === "]" || e.key === "}")) {
        e.preventDefault();
        commitTabState(cycleTab(tabStateRef.current, 1));
        return;
      }
      if (!e.shiftKey && (e.key === "w" || e.key === "W")) {
        const current = findTab(tabStateRef.current, tabStateRef.current.activeKey);
        if (!current) return;
        e.preventDefault();
        closeOpenTab(current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabsEnabled, commitTabState, applyTab, closeOpenTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const pageId = (e as CustomEvent).detail;
      if (pageId) setActiveId(pageId);
    };
    window.addEventListener("nw:navigate", handler);
    return () => window.removeEventListener("nw:navigate", handler);
  }, [setActiveId]);

  useEffect(() => {
    const open = () => setAiOpen(true);
    window.addEventListener("nw:openAI", open);
    return () => window.removeEventListener("nw:openAI", open);
  }, []);

  useEffect(() => {
    const open = () => setLectureOpen(true);
    window.addEventListener("nw:lecture", open);
    return () => window.removeEventListener("nw:lecture", open);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "j") {
        e.preventDefault();
        setAiOpen((s) => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const openAI = useCallback(() => setAiOpen(true), []);
  const openLecture = useCallback(() => setLectureOpen(true), []);

  const tabTitle = isTrashRoute
    ? "trash"
    : collectionId
      ? (collections.find((row) => row.id === collectionId)?.name || "collection")
      : activeEntry
        ? getEntryTitle(activeEntry)
        : "workspace";
  const tabPath = isTrashRoute
    ? `${basePath}/trash`
    : collectionId
      ? `${basePath}/c/${collectionId}`
      : activeId
        ? `${basePath}/n/${activeId}`
        : basePath || "/app";
  const openTabViews = tabState.tabs.map((tab) => {
    if (tab.kind === "trash") return { tab, title: "Trash" };
    if (tab.kind === "collection") {
      const row = collections.find((item) => item.id === tab.id);
      return { tab, title: row?.name?.trim() || "Untitled" };
    }
    const entry = entries.find((item) => item.id === tab.id);
    return { tab, title: entry ? getEntryTitle(entry) : "Untitled" };
  });
  const tabViewsByKey = new Map(openTabViews.map((view) => [tabKey(view.tab), view]));
  const displaySplitState = tabsEnabled
    ? normalizePageSplitState(splitState, tabState.tabs, tabState.activeKey)
    : emptyPageSplitState();
  const renderedSplitState = tabState.activeKey
    ? displaySplitState
    : {
        panes: [{
          id: displaySplitState.activePaneId,
          tabKeys: tabState.tabs.map(tabKey),
          activeKey: null,
        }],
        activePaneId: displaySplitState.activePaneId,
        sizes: [100],
      };

  const renderTabContent = (tab: PageTab | null, paneId: string, focused: boolean) => {
    if (tab?.kind === "trash") {
      return (
        <TrashView
          userId={user?.id || ""}
          onToggleSidebar={toggleSidebar}
          onRestored={() => void loadEntries({ refreshShares: true })}
        />
      );
    }
    if (tab?.kind === "collection") {
      const collection = collections.find((row) => row.id === tab.id) ?? null;
      if (collection) {
        return (
          <CollectionView
            collection={collection}
            entries={entries}
            onToggleSidebar={toggleSidebar}
            onSelect={(id) => {
              setSplitState((current) => ({ ...current, activePaneId: paneId }));
              setActiveId(id);
            }}
            onEdit={() => setCollectionDraft(collection)}
          />
        );
      }
    }

    const paneEntry = tab?.kind === "page"
      ? entries.find((entry) => entry.id === tab.id) ?? null
      : null;
    const paneEntryId = paneEntry?.id ?? null;
    return (
      <JournalEditor
        key={paneEntryId ?? `${paneId}:home`}
        entry={paneEntry}
        allEntries={entries}
        roleMap={roleMap}
        userId={user?.id || ""}
        onChange={handleChange}
        onTitleChange={handleTitleChange}
        onDelete={handleDelete}
        onTogglePin={handleTogglePin}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        breadcrumbTrail={paneEntryId ? getBreadcrumbTrail(entries, paneEntryId) : []}
        onNavigate={(id) => {
          setSplitState((current) => ({ ...current, activePaneId: paneId }));
          setActiveId(id);
        }}
        onNewSubpage={handleNewSubpage}
        onUpdateEntry={handleUpdateEntry}
        userRole={paneEntryId ? (roleMap[paneEntryId] || "owner") : "owner"}
        onNewSubpageWithTitle={handleNewSubpageWithTitle}
        onRestoreVersion={handleRestoreVersion}
        onOpenAI={openAI}
        onOpenLecture={openLecture}
        onNew={handleNew}
        onImported={() => void loadEntries()}
        onPromoteToCloud={handlePromoteToCloud}
        saveStatus={paneEntryId ? (saveStatuses[paneEntryId] ?? "idle") : "idle"}
        collabEnabled={
          Boolean(paneEntryId && sharedEntryIds.has(paneEntryId)) &&
          Boolean(import.meta.env.VITE_COLLAB_URL)
        }
        active={focused}
      />
    );
  };

  const renderPaneTabBar = (pane: PageSplitState["panes"][number]) => {
    const paneTabs = pane.tabKeys
      .map((key) => tabViewsByKey.get(key))
      .filter((view): view is NonNullable<typeof view> => Boolean(view));
    return (
      <PageTabBar
        paneId={pane.id}
        tabs={paneTabs}
        activeKey={pane.activeKey}
        onSelect={(tab) => selectTabInPane(pane.id, tab)}
        onClose={closeOpenTab}
        onCloseOthers={(tab) => closeOtherTabsInPane(pane.id, tab)}
        onCloseToRight={(tab) => closeTabsToRightInPane(pane.id, tab)}
        onMove={(from, to) =>
          setSplitState((current) => moveTabWithinPane(current, pane.id, from, to))
        }
        onDropTab={dropTabOnTab}
        onNew={() => {
          focusPane(pane.id);
          handleNew();
        }}
      />
    );
  };

  if (loading) {
    return <LoadingScreen variant="gyro" />;
  }

  return (
    <>
      <Seo title={tabTitle} path={tabPath} noIndex />
    <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden">
      {tabsEnabled && renderedSplitState.panes.length === 1 &&
        renderPaneTabBar(renderedSplitState.panes[0]!)}
      <div className="flex min-h-0 min-w-0 flex-1">
      <JournalSidebar
        allEntries={entries}
        roleMap={roleMap}
        userId={user?.id || ""}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNew}
        sidebarOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onRefetch={() => void loadEntries({ refreshShares: true }).catch((err) => toast.error("Couldn't refresh pages", { description: entryErrorMessage(err) }))}
        onHome={() => setActiveId(null)}
        onReorder={handleReorderPages}
        onMove={handleMovePage}
        onDelete={handleDelete}
        onTogglePin={handleTogglePin}
        collections={collections}
        activeCollectionId={collectionId ?? null}
        trashActive={isTrashRoute}
        overviewActive={!activeId && !collectionId && !isTrashRoute}
        onOpenTrash={openTrash}
        onOpenCollection={openCollection}
        onCreateCollection={() => setCollectionDraft({ id: "", name: "", rules: { filters: [] }, allowList: [] })}
        onEditCollection={(id) => {
          const current = collections.find((row) => row.id === id);
          if (current) setCollectionDraft(current);
        }}
        onDeleteCollection={handleDeleteCollection}
        onAddToCollection={handleAddToCollection}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        {tabsEnabled ? (
          <ResizablePanelGroup
            key={renderedSplitState.panes.map((pane) => pane.id).join(":")}
            id="page-split-panes"
            orientation="horizontal"
            defaultLayout={Object.fromEntries(
              renderedSplitState.panes.map((pane, index) => [
                pane.id,
                renderedSplitState.sizes[index] ?? 100 / renderedSplitState.panes.length,
              ]),
            )}
            onLayoutChanged={(layout, meta) => {
              if (!meta.isUserInteraction) return;
              setSplitState((current) =>
                setPaneSizes(
                  current,
                  current.panes.map((pane) => layout[pane.id] ?? 100 / current.panes.length),
                ),
              );
            }}
          >
            {renderedSplitState.panes.map((pane, index) => {
              const paneTab = findTab(tabState, pane.activeKey);
              const focused = pane.id === renderedSplitState.activePaneId;
              return (
                <Fragment key={pane.id}>
                  {index > 0 && <ResizableHandle withHandle />}
                  <ResizablePanel
                    id={pane.id}
                    defaultSize={`${renderedSplitState.sizes[index] ?? 100 / renderedSplitState.panes.length}%`}
                    minSize="20%"
                    className="min-w-0"
                  >
                    <section
                      className={`flex h-full min-w-0 flex-col ${
                        focused && renderedSplitState.panes.length > 1
                          ? "ring-1 ring-inset ring-accent-strong/30"
                          : ""
                      }`}
                      data-testid="page-split-pane"
                      data-pane-id={pane.id}
                      data-focused={focused ? "true" : "false"}
                      onMouseDownCapture={() => focusPane(pane.id)}
                    >
                      {renderedSplitState.panes.length > 1 && renderPaneTabBar(pane)}
                      <div className="min-h-0 flex-1">
                        {renderTabContent(paneTab, pane.id, focused)}
                      </div>
                    </section>
                  </ResizablePanel>
                </Fragment>
              );
            })}
          </ResizablePanelGroup>
        ) : (
          <div className="min-h-0 min-w-0 flex-1">
            {renderTabContent(
              tabFromRoute({ pageId: activeId, collectionId, trash: isTrashRoute }),
              "main",
              true,
            )}
          </div>
        )}
        </div>
      </div>
      <QuickSwitcher
        entries={entries}
        userId={userId}
        onSelect={setActiveId}
        onLinkPage={(entry) => insertPageLink(entry.id)}
        onEmbedPage={(entry) => insertPageEmbed(entry.id, getEntryTitle(entry))}
        onMoveBlocks={handleMoveBlocksToPage}
      />
      <CommandPalette
        entries={entries}
        collections={collections}
        onSelect={setActiveId}
        onSelectCollection={openCollection}
        onOpenTrash={openTrash}
        onNew={handleNew}
        onToggleSidebar={toggleSidebar}
      />
      <KeyboardPalette />
      <GraphView entries={entries} activeId={activeId} userId={userId} onNavigate={setActiveId} />
      <SettingsPanel />
      <AIAssistant
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        activeEntry={activeEntry}
        allEntries={entries}
        onCreateEntry={handleEntryCreated}
        onNavigate={setActiveId}
      />
      <LectureModePanel
        open={lectureOpen}
        onClose={() => setLectureOpen(false)}
        hasPage={Boolean(activeEntry)}
        canEdit={
          !activeId ||
          (roleMap[activeId] || "owner") === "owner" ||
          (roleMap[activeId] || "owner") === "admin" ||
          (roleMap[activeId] || "owner") === "editor"
        }
      />
      <CollectionEditorDialog
        open={collectionDraft != null}
        draft={collectionDraft}
        entries={entries}
        onOpenChange={(open) => { if (!open) setCollectionDraft(null); }}
        onSave={(info) => void handleSaveCollection(info)}
      />
      <StorageChoiceDialog
        open={storageDialogOpen}
        onOpenChange={setStorageDialogOpen}
        parentIsLocal={
          pendingCreateRef.current?.parentId
            ? isLocalEntry(
                entries.find((e) => e.id === pendingCreateRef.current?.parentId) ?? {
                  content_storage: "cloud",
                },
              )
            : false
        }
        onConfirm={handleStorageChoiceConfirm}
      />
    </div>
    </>
  );
}
