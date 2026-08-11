import { useEffect, useRef, useState, useCallback } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { X, Save, Eraser } from "@/lib/icons";
import { uploadImage } from "@/lib/imageUpload";
import {
  saveScene, loadScene, saveDraft, loadDraft, clearDraft,
} from "@/lib/drawingStore";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  /** When editing an existing scene, pass its id; else a new id is generated on save. */
  sceneId: string | null;
  /** Used as autosave key while the overlay is open (per-entry draft). */
  entryId: string;
  onSaved: (result: { sceneId: string; imageUrl: string | null; isNew: boolean }) => void;
}

/**
 * Excalidraw canvas overlay.
 * - Persists scene JSON via drawingStore (localStorage), keyed by sceneId.
 * - Autosaves a per-entry draft every few seconds while open, restored on reopen.
 * - Restores existing scene when sceneId is provided (edit-in-place).
 */
export function DrawingCanvas({ open, onClose, userId, sceneId, entryId, onSaved }: Props) {
  const apiRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [initialData, setInitialData] = useState<any | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    const isDark = document.documentElement.classList.contains("dark") ||
      getComputedStyle(document.documentElement).getPropertyValue("--background").trim().startsWith("0 0% 7");
    setTheme(isDark ? "dark" : "light");

    // priority: existing scene > entry draft > blank
    let data: any = null;
    if (sceneId) data = loadScene(sceneId);
    if (!data) data = loadDraft(entryId);
    setInitialData(data);
    setReady(true);
    return () => {
      setReady(false);
      setInitialData(null);
    };
  }, [open, sceneId, entryId]);

  // Autosave draft every 3s while open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      if (!apiRef.current) return;
      try {
        const elements = apiRef.current.getSceneElements();
        const appState = apiRef.current.getAppState();
        const files = apiRef.current.getFiles();
        if (!elements?.length) return;
        saveDraft(entryId, {
          elements,
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
          files,
        });
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [open, entryId]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const handleSave = useCallback(async () => {
    if (!apiRef.current) return;
    setSaving(true);
    try {
      const elements = apiRef.current.getSceneElements();
      const appState = apiRef.current.getAppState();
      const files = apiRef.current.getFiles();

      let imageUrl: string | null = null;
      if (elements.length) {
        const blob = await exportToBlob({
          elements,
          appState: { ...appState, exportBackground: true, exportWithDarkMode: theme === "dark" },
          files,
          mimeType: "image/png",
        });
        const file = new File([blob], `drawing-${Date.now()}.png`, { type: "image/png" });
        imageUrl = await uploadImage(file, userId);
      }

      const scene = {
        elements,
        appState: { viewBackgroundColor: appState.viewBackgroundColor },
        files,
      };
      const finalSceneId = sceneId || (crypto as any).randomUUID();
      saveScene(finalSceneId, scene);
      clearDraft(entryId);
      onSaved({ sceneId: finalSceneId, imageUrl, isNew: !sceneId });
      onClose();
    } catch (err) {
      console.error("Drawing save failed", err);
    } finally {
      setSaving(false);
    }
  }, [theme, userId, sceneId, entryId, onSaved, onClose]);

  const handleClear = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.updateScene({ elements: [] });
    clearDraft(entryId);
  }, [entryId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
      <header className="h-11 flex items-center px-2 sm:px-3 border-b border-border gap-1 sm:gap-2 shrink-0 bg-card/80">
        <pre className="text-[9px] leading-none text-muted-foreground/60 font-mono select-none hidden sm:block">
{`┌─┐
│▓│ canvas
└─┘`}
        </pre>
        <span className="text-xs font-medium ml-1">{sceneId ? "Edit drawing" : "New drawing"}</span>
        <span className="text-[10px] text-muted-foreground/60 ml-1 hidden lg:inline">
          autosaves every few seconds · esc to close
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleClear}
            className="text-[11px] px-2 py-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors flex items-center gap-1"
            title="Clear canvas"
          >
            <Eraser className="h-3 w-3" /> <span className="hidden sm:inline">Clear</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-[11px] px-2.5 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1 disabled:opacity-50"
            title="Save drawing & insert into page"
          >
            <Save className="h-3 w-3" /> {saving ? "Saving…" : (sceneId ? "Update" : "Save & insert")}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Close (esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        {ready && (
          <Excalidraw
            excalidrawAPI={(api) => { apiRef.current = api; }}
            theme={theme}
            initialData={initialData || undefined}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: true,
                clearCanvas: true,
                export: { saveFileToDisk: true },
                loadScene: true,
                saveToActiveFile: false,
                toggleTheme: true,
                saveAsImage: true,
              },
            }}
          />
        )}
      </div>
    </div>
  );
}
