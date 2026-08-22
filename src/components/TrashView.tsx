import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, PanelLeft, RotateCcw, Trash2, X } from "@/lib/icons";
import { fetchTrash, getEntryTitle, permanentlyDeleteEntry, restoreEntry, type Entry } from "@/lib/journal";
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
import { toast } from "sonner";

interface Props {
  userId: string;
  onToggleSidebar: () => void;
  onRestored: () => void;
}

export function TrashView({ userId, onToggleSidebar, onRestored }: Props) {
  const [trash, setTrash] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeId, setPurgeId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    fetchTrash(userId)
      .then(setTrash)
      .catch(() => setTrash([]))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (id: string) => {
    try {
      await restoreEntry(id);
      setTrash((prev) => prev.filter((entry) => entry.id !== id));
      onRestored();
    } catch (err) {
      toast.error("Couldn't restore page", { description: (err as Error).message });
    }
  };

  const handlePurge = async () => {
    if (!purgeId) return;
    try {
      await permanentlyDeleteEntry(purgeId);
      setTrash((prev) => prev.filter((entry) => entry.id !== purgeId));
      setPurgeId(null);
    } catch (err) {
      toast.error("Couldn't delete page", { description: (err as Error).message });
    }
  };

  const pending = trash.find((entry) => entry.id === purgeId) ?? null;

  return (
    <div className="flex-1 flex flex-col h-screen min-w-0 w-full">
      <header className="h-12 flex items-center px-2 sm:px-3 border-b border-border-subtle gap-1 sm:gap-2 shrink-0">
        <button onClick={onToggleSidebar} className="text-muted-foreground hover:text-foreground transition-colors" title="Toggle sidebar (⌘B)">
          <PanelLeft className="h-4 w-4" />
        </button>
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm truncate">Trash</span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> loading…
          </div>
        ) : trash.length === 0 ? (
          <p className="text-sm text-muted-foreground">trash is empty</p>
        ) : (
          <ul className="flex flex-col gap-px max-w-xl">
            {trash.map((entry) => (
              <li key={entry.id} className="group flex h-8 items-center rounded-lg px-2 text-[13px] hover:bg-sidebar-accent/60">
                <FileText className="h-3 w-3 opacity-60 shrink-0 mr-2" />
                <span className="flex-1 truncate text-sidebar-foreground/80">{getEntryTitle(entry)}</span>
                <button
                  type="button"
                  onClick={() => handleRestore(entry.id)}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-sidebar-accent"
                  title="Restore"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setPurgeId(entry.id)}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  title="Delete forever"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={purgeId != null} onOpenChange={(open) => { if (!open) setPurgeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? `“${getEntryTitle(pending)}” will be deleted forever. This cannot be undone.` : "This page will be deleted forever."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handlePurge()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
