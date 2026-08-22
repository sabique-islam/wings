import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { fetchEntries, syncWorkspaceEntries, updateEntry, updateEntryTitle, moveEntry, saveEntryOrder, deleteEntry, togglePin, getBreadcrumbTrail, Entry, getEntryTitle, findReusableBlankDraft, ShareRole } from "@/lib/journal";
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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LoadingScreen } from "@/components/ui/spinner";
import { Seo } from "@/components/Seo";

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
  const [aiOpen, setAiOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Distinct from `loading`: the cached paint clears `loading` early, but a
  // page missing from the mirror is not yet proof the page is gone.
  const [serverSynced, setServerSynced] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    try {
      localStorage.setItem("nw:sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* private browsing */
    }
  }, [sidebarCollapsed]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const creatingRef = useRef(false);
  const pendingPayloadRef = useRef<EditorChangePayload | null>(null);
  const [sharedEntryIds, setSharedEntryIds] = useState<Set<string>>(() => new Set());
  const [defaultStorage, setDefaultStorage] = useState<DefaultContentStorage>("cloud");
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const pendingCreateRef = useRef<{
    ownerId: string;
    parentId?: string | null;
    initialContent?: string;
    onCreated?: (entry: Entry) => void;
    activate?: boolean;
  } | null>(null);
  const SAVE_DEBOUNCE_MS = 1500;
  // Read by debounced save work so the callbacks feeding the editor keep a
  // stable identity across the state updates each save produces.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

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

  useEffect(() => {
    if (isTrashRoute || collectionId) {
      setActiveIdRaw(null);
      return;
    }
    setActiveIdRaw(routeId ?? null);
  }, [routeId, collectionId, isTrashRoute]);

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
        } catch {
          // Network or auth still down — leave queued for the next session.
        }
      }
      if (activeId) setSaveStatus("idle");
    })();
  }, [userId, loading, activeId]);

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
  const breadcrumbTrail = activeId ? getBreadcrumbTrail(entries, activeId) : [];
  // Known before the editor mounts: TipTap cannot switch into collaborative
  // mode later without throwing away the editor the user is typing in.
  const collabEnabled =
    Boolean(activeId && sharedEntryIds.has(activeId)) && Boolean(import.meta.env.VITE_COLLAB_URL);

  // Redirect when URL points to a missing/deleted page
  useEffect(() => {
    if (!serverSynced || !activeId) return;
    if (isTrashRoute || collectionId) return;
    if (activeEntry) return;
    setActiveIdRaw(null);
    navigate(basePath || "/app", { replace: true });
  }, [serverSynced, activeId, activeEntry, basePath, navigate, isTrashRoute, collectionId]);

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
    const ownerId = resolveEntryOwnerId(parentId, user.id, entries, roleMap);
    requestCreatePage({
      ownerId,
      parentId,
      initialContent: `# ${title}\n\n`,
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
    // Stale serialize from a note we already left — draft only, no autosave / pending ref.
    if (entryId !== activeId) return;

    pendingPayloadRef.current = payload;

    // While Yjs collab is live, Hocuspocus owns persistence — skip full-doc UPDATE.
    if (collabEnabled) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!activeId) return;
      // Typing emits JSON only, so ask the editor for markdown now — `content`
      // and `content_json` must come from one serialize of one document.
      const pending = pendingPayloadRef.current;
      const toSave = requestEditorSerialize(activeId) ?? (isFullPayload(pending) ? pending : null);
      if (!toSave) return;
      pendingPayloadRef.current = toSave;
      const existing = entriesRef.current.find((e) => e.id === activeId);
      const existingContent = existing ? getCanonicalContent(existing) : "";
      if (existing && shouldBlockEmptySave(existingContent, toSave.markdown)) {
        console.warn("[wings] blocked empty autosave over existing content");
        return;
      }
      if (existing && isSameEditorPayload(existing, toSave)) return;
      setSaveStatus("saving");
      // Durable locally before the network is attempted, so a refresh while the
      // request is in flight still shows what was typed.
      if (userId && existing) {
        void putCachedEntry(userId, { ...existing, content: toSave.markdown, content_json: toSave.json });
      }
      try {
        if (existing && isLocalEntry(existing)) {
          await persistEntryBody(userId!, existing, entriesRef.current, toSave);
        } else {
          await updateEntry(activeId, toSave);
        }
        setEntries((prev) =>
          prev.map((e) =>
            e.id === activeId
              ? { ...e, content: toSave.markdown, content_json: toSave.json }
              : e,
          ),
        );
        clearDraft(activeId);
        clearPendingWrite(activeId);
        if (!existing || !isLocalEntry(existing)) {
          void recordEntryVersion(activeId, userId ?? null, {
            content: toSave.markdown,
            content_json: toSave.json,
          });
        }
        setSaveStatus("saved");
        if (userId && existing && !isLocalEntry(existing)) {
          void mirrorEntryToVault(
            userId,
            { ...existing, content: toSave.markdown, content_json: toSave.json },
            entriesRef.current,
          );
        }
        if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
        savedFlashRef.current = setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        queuePendingWrite(activeId, { markdown: toSave.markdown, json: toSave.json });
        setSaveStatus("error");
      }
    }, SAVE_DEBOUNCE_MS);
  }, [activeId, collabEnabled, userId]);

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

  const handleTitleChange = useCallback((title: string) => {
    if (!activeId) return;
    setEntries((prev) => prev.map((e) => (e.id === activeId ? { ...e, title } : e)));
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(async () => {
      if (activeId) {
        try {
          await updateEntryTitle(activeId, title);
        } catch {
          toast.error("Couldn't save title");
        }
      }
    }, 500);
  }, [activeId]);

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

  const flushEditor = useCallback(() => {
    if (!activeId) return;
    const payload = requestEditorSerialize(activeId);
    if (!payload) return;
    pendingPayloadRef.current = payload;
    saveDraft(activeId, payload);
  }, [activeId]);

  /** On page switch, persist draft for the note we're leaving. */
  const flushDraftForEntry = useCallback((entryId: string) => {
    if (entryId !== activeId) return;
    // Its editor is still mounted at this point, so take a full serialize
    // rather than the JSON-only payload the typing path leaves behind.
    const payload = requestEditorSerialize(entryId) ?? pendingPayloadRef.current;
    if (payload) saveDraft(entryId, payload);
  }, [activeId]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushEditor();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", flushEditor);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", flushEditor);
    };
  }, [flushEditor]);

  useEffect(() => {
    const leavingId = activeId;
    return () => {
      if (leavingId) flushDraftForEntry(leavingId);
    };
  }, [activeId, flushDraftForEntry]);

  useEffect(() => {
    const onCollabFlush = async () => {
      if (!activeId) return;
      flushEditor();
      const toSave = pendingPayloadRef.current;
      if (!isFullPayload(toSave)) return;
      const existing = entriesRef.current.find((e) => e.id === activeId);
      if (existing && isLocalEntry(existing)) return;
      if (existing && shouldBlockEmptySave(getCanonicalContent(existing), toSave.markdown)) {
        console.warn("[wings] blocked empty collab flush over existing content");
        return;
      }
      try {
        await updateEntry(activeId, toSave);
        clearDraft(activeId);
        void recordEntryVersion(activeId, userId ?? null, {
          content: toSave.markdown,
          content_json: toSave.json,
        });
      } catch {
        queuePendingWrite(activeId, { markdown: toSave.markdown, json: toSave.json });
      }
    };
    window.addEventListener("nw:collab-flush", onCollabFlush);
    return () => window.removeEventListener("nw:collab-flush", onCollabFlush);
  }, [activeId, flushEditor, userId]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteEntry(id);
      const removed = new Set<string>();
      const collect = (pid: string) => {
        removed.add(pid);
        entriesRef.current.filter((e) => e.parent_id === pid).forEach((e) => collect(e.id));
      };
      collect(id);
      removed.forEach(forgetLinkIndex);
      setEntries((prev) => prev.filter((e) => !removed.has(e.id)));
      if (activeId && removed.has(activeId)) setActiveId(null);
    } catch (err) {
      console.error("Failed to delete page:", err);
      toast.error("Couldn't delete page", { description: entryErrorMessage(err) });
    }
  }, [activeId, setActiveId]);

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
      if (collectionId === id) navigate(basePath || "/app");
    } catch (err) {
      toast.error("Couldn't delete collection", { description: entryErrorMessage(err) });
    }
  }, [userId, collectionId, navigate, basePath]);

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
  const activeCollection = collectionId
    ? collections.find((row) => row.id === collectionId) ?? null
    : null;

  if (loading) {
    return <LoadingScreen variant="gyro" />;
  }

  return (
    <>
      <Seo title={tabTitle} path={tabPath} noIndex />
    <div className="flex w-full h-screen overflow-hidden min-w-0">
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
      {isTrashRoute ? (
        <TrashView
          userId={user?.id || ""}
          onToggleSidebar={toggleSidebar}
          onRestored={() => void loadEntries({ refreshShares: true })}
        />
      ) : activeCollection ? (
        <CollectionView
          collection={activeCollection}
          entries={entries}
          onToggleSidebar={toggleSidebar}
          onSelect={setActiveId}
          onEdit={() => setCollectionDraft(activeCollection)}
        />
      ) : (
      <JournalEditor
        entry={activeEntry}
        allEntries={entries}
        roleMap={roleMap}
        userId={user?.id || ""}
        onChange={handleChange}
        onTitleChange={handleTitleChange}
        onDelete={handleDelete}
        onTogglePin={handleTogglePin}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        breadcrumbTrail={breadcrumbTrail}
        onNavigate={setActiveId}
        onNewSubpage={handleNewSubpage}
        onUpdateEntry={handleUpdateEntry}
        userRole={activeId ? (roleMap[activeId] || "owner") : "owner"}
        onNewSubpageWithTitle={handleNewSubpageWithTitle}
        onRestoreVersion={handleRestoreVersion}
        onOpenAI={openAI}
        onNew={handleNew}
        onImported={() => void loadEntries()}
        onPromoteToCloud={handlePromoteToCloud}
        saveStatus={saveStatus}
        collabEnabled={collabEnabled}
      />
      )}
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
