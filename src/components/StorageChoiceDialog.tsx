import { useState } from "react";
import { Cloud, HardDrive } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContentStorage, DefaultContentStorage } from "@/lib/localContent";

export interface StorageChoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentIsLocal?: boolean;
  onConfirm: (storage: ContentStorage, remember: DefaultContentStorage | null) => void;
}

export function StorageChoiceDialog({
  open,
  onOpenChange,
  parentIsLocal = false,
  onConfirm,
}: StorageChoiceDialogProps) {
  const [choice, setChoice] = useState<ContentStorage>(parentIsLocal ? "local" : "cloud");
  const [remember, setRemember] = useState(false);

  const handleConfirm = () => {
    onConfirm(choice, remember ? choice : null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">Where should this page live?</DialogTitle>
          <DialogDescription className="text-sm font-sans">
            Local pages stay on your device. Cloud pages can be shared and searched across devices.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent-soft/30">
            <input
              type="radio"
              name="storage"
              className="mt-1"
              checked={choice === "local"}
              onChange={() => setChoice("local")}
            />
            <div className="space-y-0.5">
              <span className="flex items-center gap-1.5 text-sm font-mono">
                <HardDrive className="h-3.5 w-3.5" /> On this device (private)
              </span>
              <p className="text-xs text-ink-2 font-sans">Requires a connected vault folder. Not shareable.</p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent-soft/30">
            <input
              type="radio"
              name="storage"
              className="mt-1"
              checked={choice === "cloud"}
              onChange={() => setChoice("cloud")}
            />
            <div className="space-y-0.5">
              <span className="flex items-center gap-1.5 text-sm font-mono">
                <Cloud className="h-3.5 w-3.5" /> In the cloud (shareable)
              </span>
              <p className="text-xs text-ink-2 font-sans">Stored on Wings servers. Share links and collab work.</p>
            </div>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs font-mono text-ink-2">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember my choice for new pages
        </label>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded bg-accent-strong px-3 py-1.5 text-xs font-mono text-accent-strong-foreground hover:bg-accent-strong-hover"
          >
            create page
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface PromoteToCloudDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy?: boolean;
}

export function PromoteToCloudDialog({ open, onOpenChange, onConfirm, busy }: PromoteToCloudDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">Move to cloud?</DialogTitle>
          <DialogDescription className="text-sm font-sans">
            Your note will be uploaded to Wings servers so you can share it and search it across devices.{" "}
            <strong>This cannot be undone.</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
          >
            cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded bg-accent-strong px-3 py-1.5 text-xs font-mono text-accent-strong-foreground hover:bg-accent-strong-hover disabled:opacity-50"
          >
            {busy ? "uploading…" : "move to cloud"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
