import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RotateCcw, X } from "@/lib/icons";
import { toast } from "sonner";
import { getEntryVersion, listEntryVersions, type EntryVersion } from "@/lib/entryVersions";

interface Props {
  open: boolean;
  onClose: () => void;
  entryId: string;
  canRestore: boolean;
  onRestore: (versionId: string) => Promise<void>;
}

function timeLabel(iso: string): string {
  const at = new Date(iso);
  const today = new Date().toDateString() === at.toDateString();
  return today
    ? at.toLocaleTimeString("default", { hour: "numeric", minute: "2-digit" })
    : at.toLocaleString("default", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function VersionHistory({ open, onClose, entryId, canRestore, onRestore }: Props) {
  const [versions, setVersions] = useState<EntryVersion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    setSelectedId(null);
    setPreview(null);
    listEntryVersions(entryId)
      .then(setVersions)
      .catch((err) => {
        console.error("Failed to load version history:", err);
        toast.error("Couldn't load version history");
        setVersions([]);
      });
  }, [open, entryId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const select = useCallback((versionId: string) => {
    setSelectedId(versionId);
    setPreview(null);
    getEntryVersion(versionId)
      .then((snapshot) => setPreview(snapshot?.content ?? ""))
      .catch((err) => {
        console.error("Failed to load version:", err);
        toast.error("Couldn't load that version");
      });
  }, []);

  const restore = useCallback(async () => {
    if (!selectedId) return;
    setRestoring(true);
    try {
      await onRestore(selectedId);
      onClose();
    } finally {
      setRestoring(false);
    }
  }, [selectedId, onRestore, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="fixed inset-0 bg-background/80" />
      <div
        className="relative w-full max-w-3xl h-[70vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-10 flex items-center gap-2 px-3 border-b border-border shrink-0">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold tracking-tight">Version history</span>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Close (esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <ul className="w-56 shrink-0 border-r border-border overflow-y-auto py-1">
            {versions === null && (
              <li className="px-3 py-2 text-[11px] text-muted-foreground/50 font-mono">loading…</li>
            )}
            {versions?.length === 0 && (
              <li className="px-3 py-2 text-[11px] text-muted-foreground/50 font-mono">
                no snapshots yet
              </li>
            )}
            {versions?.map((version) => (
              <li key={version.id}>
                <button
                  onClick={() => select(version.id)}
                  className={`w-full text-left px-3 py-2 text-[11px] font-mono transition-colors ${
                    version.id === selectedId
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50"
                  }`}
                >
                  {timeLabel(version.created_at)}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {!selectedId ? (
                <p className="text-[11px] text-muted-foreground/50 font-mono">
                  Pick a snapshot to see what this page looked like.
                </p>
              ) : preview === null ? (
                <p className="text-[11px] text-muted-foreground/50 font-mono">loading…</p>
              ) : (
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground">
                  {preview || "(empty)"}
                </pre>
              )}
            </div>
            {selectedId && canRestore && (
              <div className="border-t border-border p-2 flex items-center justify-end gap-2">
                <span className="text-[10px] text-muted-foreground/50 font-mono mr-auto">
                  restoring replaces the current page content
                </span>
                <button
                  onClick={restore}
                  disabled={restoring || preview === null}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium rounded px-3 py-1.5 hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {restoring ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Restore
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
