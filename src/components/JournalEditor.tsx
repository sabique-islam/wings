import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { Entry, ShareRole } from "@/lib/journal";
import { getEntryTitle } from "@/lib/journal";
import { buildPagePreview, refreshPageEmbeds } from "@/components/BlockEditor/PageEmbedExtension";
import type { EditorChangePayload } from "@/lib/editorPayload";
import { useCollabProvider } from "@/lib/collab/useCollabProvider";
import { useAuth } from "@/hooks/useAuth";
import { Trash2, PanelLeft, Download, Pin, PinOff, FilePlus, History, Keyboard, Sparkles, PenTool, Hash, Upload, FileJson, FileText, Lock, Cloud } from "@/lib/icons";
import { EmptyStateAscii } from "@/components/AsciiAnimation";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { BlockEditor } from "@/components/BlockEditor/BlockEditor";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BacklinksPanel } from "@/components/BacklinksPanel";
import { VersionHistory } from "@/components/VersionHistory";
import { ShareMenu } from "@/components/ShareMenu";
import { PromoteToCloudDialog } from "@/components/StorageChoiceDialog";
import { isLocalEntry } from "@/lib/localContent";
import { requestEditorSerialize } from "@/lib/editorPayload";
import { focusEndOfPage } from "@/components/BlockEditor/focusEndOfPage";
import { exportSingleEntry, exportSingleAsJson, importFile } from "@/lib/export";
import { importNotionFiles } from "@/lib/notionImport";
import { toast } from "sonner";
import { uploadImage } from "@/lib/imageUpload";
import { InlineAIMenu } from "@/components/InlineAIMenu";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { PagePeekHost } from "@/components/PagePeekHost";
import { rememberDrawingSnapshot } from "@/lib/ai/excalidrawContext";
import { countWords, countWordsInDoc, readingTime } from "@/lib/documentStats";
import { Check, CloudOff } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  entry: Entry | null;
  allEntries?: Entry[];
  roleMap?: Record<string, ShareRole>;
  userId: string;
  onChange: (entryId: string, payload: EditorChangePayload) => void;
  onTitleChange?: (title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  breadcrumbTrail: Entry[];
  onNavigate: (id: string | null) => void;
  onNewSubpage: (parentId: string) => void;
  onUpdateEntry: (entry: Entry) => void;
  userRole: ShareRole;
  onNewSubpageWithTitle: (parentId: string, title: string) => Promise<void>;
  onRestoreVersion: (entryId: string, versionId: string) => Promise<void>;
  onOpenAI: () => void;
  onImported?: () => void;
  onNew?: () => void;
  onPromoteToCloud?: (entryId: string, payload: EditorChangePayload) => Promise<void>;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  collabEnabled?: boolean;
}

const WORD_COUNT_DEBOUNCE_MS = 300;

function canEditRole(role: ShareRole): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export function JournalEditor({ entry, allEntries = [], roleMap = {}, userId, onChange, onTitleChange, onDelete, onTogglePin, sidebarOpen, onToggleSidebar, breadcrumbTrail, onNavigate, onNewSubpage, onUpdateEntry, userRole, onNewSubpageWithTitle, onRestoreVersion, onOpenAI, onImported, onNew, onPromoteToCloud, saveStatus = "idle", collabEnabled = false }: Props) {
  const { user } = useAuth();
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      const looksLikeNotion =
        files.length > 1 ||
        files.some((f) => /\.csv$/i.test(f.name) || /\s[a-f0-9]{32}\.(md|markdown)$/i.test(f.name));
      let total = 0;
      if (looksLikeNotion) {
        const created = await importNotionFiles(files, userId);
        total = created.length;
      } else {
        for (const f of files) {
          const created = await importFile(f, userId);
          total += created.length;
        }
      }
      toast.success(`imported ${total} entr${total === 1 ? "y" : "ies"}`);
      onImported?.();
    } catch (err: any) {
      toast.error(err?.message || "import failed");
    } finally {
      e.target.value = "";
    }
  }, [userId, onImported]);

  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(() => {
    return localStorage.getItem("nw:lineNumbers") === "1";
  });
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("nw:lineNumbers", showLineNumbers ? "1" : "0");
  }, [showLineNumbers]);

  // Listen for "edit drawing" requests from the inline node view
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.sceneId as string | undefined;
      if (!id) return;
      setEditingSceneId(id);
      setDrawingOpen(true);
    };
    window.addEventListener("nw:editDrawing", handler);
    return () => window.removeEventListener("nw:editDrawing", handler);
  }, []);

  // Free-canvas / layout-bridge was removed in favor of in-flow markdown editing.
  // Excalidraw is used for any free-form drawing/canvas needs.


  // `entry.content` only catches up after a save lands, so it reads stale for as
  // long as someone keeps typing. Fall back to it only until the first emit.
  const [liveWords, setLiveWords] = useState<number | null>(null);
  const wordCountTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const words = liveWords ?? (entry ? countWords(entry.content) : 0);
  const canEdit = canEditRole(userRole);
  const { session: collabSession, connecting: collabConnecting } = useCollabProvider(
    entry?.id ?? null,
    collabEnabled && canEdit,
    userId,
    user?.email ?? "",
  );
  const canDelete = userRole === "owner" || userRole === "admin";
  const canManage = userRole === "owner" || userRole === "admin";
  const entryIsLocal = entry ? isLocalEntry(entry) : false;

  const handlePromoteConfirm = useCallback(async () => {
    if (!entry || !onPromoteToCloud) return;
    const payload = requestEditorSerialize(entry.id);
    if (!payload) {
      toast.error("Couldn't read page content");
      return;
    }
    setPromoteBusy(true);
    try {
      await onPromoteToCloud(entry.id, payload);
      setPromoteOpen(false);
    } catch {
      /* toast from parent */
    } finally {
      setPromoteBusy(false);
    }
  }, [entry, onPromoteToCloud]);

  // The editor rebuilds its extension list whenever its handler props change
  // identity, so the upload handler reads the entry through a ref rather than
  // closing over an object that is replaced on every save.
  const entryRef = useRef(entry);
  entryRef.current = entry;

  const handleImageFile = useCallback(async (file: File) => {
    const current = entryRef.current;
    if (!file.type.startsWith("image/") || !current) return;
    setUploading(true);
    const url = await uploadImage(file, userId);
    if (url) {
      if ((window as any).__nw_insertImage) {
        (window as any).__nw_insertImage(url);
      } else {
        onChange(current.id, {
          markdown: current.content + `\n![image](${url})\n`,
          json: current.content_json ?? { type: "doc", content: [] },
        });
      }
    }
    setUploading(false);
  }, [userId, onChange]);

  const handleImageUpload = useCallback((file?: File) => {
    if (file) {
      handleImageFile(file);
    } else {
      fileInputRef.current?.click();
    }
  }, [handleImageFile]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await handleImageFile(file);
    }
    e.target.value = "";
  }, [handleImageFile]);

  // Bound to the id the editor was mounted with, not to whatever is active now:
  // the outgoing editor serializes one last time during unmount, by which point
  // the shell has already switched to the next page.
  const editorEntryId = entry?.id ?? null;

  const handleEditorChange = useCallback((payload: EditorChangePayload) => {
    if (!editorEntryId) return;
    onChange(editorEntryId, payload);
    if (wordCountTimer.current) clearTimeout(wordCountTimer.current);
    wordCountTimer.current = setTimeout(
      () => setLiveWords(countWordsInDoc(payload.json)),
      WORD_COUNT_DEBOUNCE_MS,
    );
  }, [editorEntryId, onChange]);

  useEffect(() => {
    setLiveWords(null);
    return () => {
      if (wordCountTimer.current) clearTimeout(wordCountTimer.current);
    };
  }, [editorEntryId]);

  const handleLinkPage = useCallback(() => {
    window.dispatchEvent(new CustomEvent("nw:linkpage"));
  }, []);

  const handleEmbedPage = useCallback(() => {
    window.dispatchEvent(new CustomEvent("nw:embedpage"));
  }, []);

  const handleNewPage = useCallback((title: string) => {
    if (editorEntryId) void onNewSubpageWithTitle(editorEntryId, title);
  }, [editorEntryId, onNewSubpageWithTitle]);

  const pages = useMemo(
    () => allEntries.map((e) => ({ id: e.id, title: e.title || "Untitled" })),
    [allEntries],
  );

  const getPagePreview = useCallback(
    (pageId: string) => {
      const entry = allEntries.find((e) => e.id === pageId);
      if (!entry) return null;
      return buildPagePreview(entry.content, getEntryTitle(entry));
    },
    [allEntries],
  );

  useEffect(() => refreshPageEmbeds(), [allEntries]);

  return (
    <div className="flex-1 flex flex-col h-screen min-w-0 w-full">
      <header className="h-12 flex items-center px-2 sm:px-3 border-b border-border-subtle gap-1 sm:gap-2 shrink-0 overflow-x-auto">
        <button onClick={onToggleSidebar} className="text-muted-foreground hover:text-foreground transition-colors" title="Toggle sidebar (⌘B)">
          <PanelLeft className="h-4 w-4" />
        </button>
        {entry && (
          <>
            <Breadcrumbs trail={breadcrumbTrail} onNavigate={onNavigate} />
            <span className="text-[10px] text-muted-foreground ml-2">
              {new Date(entry.created_at).toLocaleDateString("default", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <span className="text-[10px] text-muted-foreground/50 ml-2">
              {words}w · {readingTime(words)}
            </span>
            {uploading && (
              <span className="text-[10px] text-muted-foreground/50 ml-2 animate-pulse">uploading…</span>
            )}
            {collabSession && (
              <span className="text-[10px] text-emerald-600/80 ml-2 font-mono flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                live
              </span>
            )}
            {entryIsLocal && (
              <span className="text-[10px] text-muted-foreground/60 ml-2 font-mono flex items-center gap-1" title="Stored on this device only">
                <Lock className="h-3 w-3" /> local
              </span>
            )}
            {saveStatus === "saving" && !collabSession && (
              <span className="text-[10px] text-muted-foreground/60 ml-2 font-mono flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" />
                saving…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-[10px] text-muted-foreground/40 ml-2 font-mono flex items-center gap-1">
                <Check className="h-3 w-3" /> saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-[10px] text-destructive/80 ml-2 font-mono flex items-center gap-1">
                <CloudOff className="h-3 w-3" /> offline · queued
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {userRole === "viewer" && (
                <span className="text-[10px] text-muted-foreground/50 font-mono px-2">view only</span>
              )}
              {userRole === "editor" && (
                <span className="text-[10px] text-muted-foreground/50 font-mono px-2">editor</span>
              )}
              {canManage && !entryIsLocal && <ShareMenu entry={entry} onUpdate={onUpdateEntry} />}
              {canManage && (
                <button
                  onClick={() => onNewSubpage(entry.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Create sub-page"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => onTogglePin(entry.id, !entry.pinned)}
                  className={`p-1.5 rounded transition-colors ${entry.pinned ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  title={entry.pinned ? "Unpin" : "Pin entry"}
                >
                  {entry.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => { setEditingSceneId(null); setDrawingOpen(true); }}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Open drawing canvas"
                >
                  <PenTool className="h-3.5 w-3.5" />
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => !entryIsLocal && setHistoryOpen(true)}
                  disabled={entryIsLocal}
                  className={`p-1.5 rounded transition-colors ${entryIsLocal ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-foreground"}`}
                  title={entryIsLocal ? "Version history isn't available for local pages" : "Version history"}
                >
                  <History className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowLineNumbers((s) => !s)}
                className={`p-1.5 rounded transition-colors ${showLineNumbers ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
              >
                <Hash className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onOpenAI}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Open AI assistant (⌘J)"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Import / export"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-mono text-xs">
                  <DropdownMenuItem onClick={() => exportSingleEntry(entry)}>
                    <FileText className="h-3.5 w-3.5 mr-2" /> export as markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportSingleAsJson(entry)}>
                    <FileJson className="h-3.5 w-3.5 mr-2" /> export as JSON
                  </DropdownMenuItem>
                  {canManage && entryIsLocal && onPromoteToCloud && (
                    <DropdownMenuItem onClick={() => setPromoteOpen(true)}>
                      <Cloud className="h-3.5 w-3.5 mr-2" /> move to cloud…
                    </DropdownMenuItem>
                  )}
                  {canManage && (
                    <DropdownMenuItem onClick={() => importInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5 mr-2" /> import file(s)…
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={importInputRef}
                type="file"
                accept=".md,.markdown,.json,.csv,text/markdown,application/json,text/csv"
                multiple
                className="hidden"
                onChange={handleImport}
              />
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("nw:shortcuts"))}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Keyboard shortcuts (⌘?)"
              >
                <Keyboard className="h-3.5 w-3.5" />
              </button>
              {canDelete && (
                <button
                  onClick={() => onDelete(entry.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </header>

      <div className={`flex-1 min-h-0 overflow-y-auto relative w-full min-w-0 ${showLineNumbers ? "nw-line-numbers" : ""}`}>
        {!entry ? (
          allEntries.length > 0 ? (
            <DashboardHome
              entries={allEntries}
              roleMap={roleMap}
              onSelect={(id) => onNavigate(id)}
              onNew={onNew ?? (() => {})}
              onOpenAI={onOpenAI}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 relative">
              <EmptyStateAscii />
              <p className="text-[10px] text-ink-3 font-mono">⌘K palette · ⌘N create · ⌘J for AI</p>
            </div>
          )
        ) : (
          <div className="page-editor-viewport">
          <div className="page-editor-body w-full max-w-[708px] mx-auto px-6 md:px-10 pt-6">
            <textarea
              ref={titleRef}
              key={`title-${entry.id}`}
              className="page-title-input w-full resize-none overflow-hidden bg-transparent border-0 outline-none font-bold text-[2.5rem] leading-tight tracking-tight text-foreground placeholder:text-muted-foreground/40 mb-2"
              placeholder="Untitled"
              rows={1}
              defaultValue={entry.title || ""}
              readOnly={!canEdit}
              onChange={(e) => {
                onTitleChange?.(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "ArrowDown") {
                  e.preventDefault();
                  (window as any).__nw_editor?.commands.focus("start");
                }
              }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = `${t.scrollHeight}px`;
              }}
            />
            {/* A shared page waits for its Yjs session: the editor cannot adopt
                collaboration extensions once it exists, so mounting early would
                throw away the instance a moment later. */}
            {!collabConnecting && (
              <BlockEditor
                key={entry.id}
                entryId={entry.id}
                content={entry.content}
                contentJson={entry.content_json}
                onChange={handleEditorChange}
                onImageUpload={canEdit ? handleImageUpload : undefined}
                onLinkPage={canEdit ? handleLinkPage : undefined}
                onEmbedPage={canEdit ? handleEmbedPage : undefined}
                onNewPage={canEdit ? handleNewPage : undefined}
                onAskAI={canEdit ? onOpenAI : undefined}
                pages={pages}
                getPagePreview={getPagePreview}
                editable={canEdit}
                collabSession={collabSession}
              />
            )}
            <BacklinksPanel entryId={entry.id} entries={allEntries} onNavigate={onNavigate} />
            <InlineAIMenu />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
            {canEdit && (
              <div
                className="page-editor-blank"
                data-testid="page-editor-blank"
                onClick={() => focusEndOfPage((window as any).__nw_editor)}
              />
            )}
          </div>
        )}
      </div>
      {entry && !entryIsLocal && (
        <VersionHistory
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          entryId={entry.id}
          canRestore={canEdit}
          onRestore={(versionId) => onRestoreVersion(entry.id, versionId)}
        />
      )}
      {entry && (
        <PromoteToCloudDialog
          open={promoteOpen}
          onOpenChange={setPromoteOpen}
          onConfirm={() => void handlePromoteConfirm()}
          busy={promoteBusy}
        />
      )}
      {entry && (
        <DrawingCanvas
          open={drawingOpen}
          onClose={() => { setDrawingOpen(false); setEditingSceneId(null); }}
          userId={userId}
          sceneId={editingSceneId}
          entryId={entry.id}
          onSaved={({ sceneId, imageUrl, isNew }) => {
            const editor = (window as any).__nw_editor;
            if (imageUrl) rememberDrawingSnapshot(sceneId, imageUrl);
            if (isNew) {
              if (editor && editor.commands.insertDrawing) {
                editor.chain().focus("end").insertDrawing({ sceneId, imageUrl }).run();
              } else if (imageUrl) {
                onChange(entry.id, {
                  markdown: entry.content + `\n\n![drawing](${imageUrl})\n`,
                  json: entry.content_json ?? { type: "doc", content: [] },
                });
              }
            } else {
              // broadcast so existing node views can refresh their imageUrl
              window.dispatchEvent(new CustomEvent("nw:drawingUpdated", { detail: { sceneId, imageUrl } }));
            }
          }}
        />
      )}
      <PagePeekHost
        entries={allEntries}
        pages={pages}
        getPagePreview={getPagePreview}
        onNavigate={onNavigate}
      />
    </div>
  );
}
