import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Cloud,
  CircleHelp,
  FolderDown,
  FolderOpen,
  FolderUp,
  HardDrive,
  RefreshCw,
  Unplug,
  Upload,
  FileDown,
} from "@/lib/icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  downloadAccountExport,
  importVaultExportFiles,
  vaultFilesFromFileList,
} from "@/lib/accountExport";
import { putVaultMeta, type VaultMetaRow } from "@/lib/localStore";
import { fetchEntries, type Entry } from "@/lib/journal";
import { hydrateLocalEntries } from "@/lib/localContent";
import type { DefaultContentStorage } from "@/lib/localContent";
import { updateUserPreferences } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { isVaultSupported, type VaultConflict } from "@/lib/vault/types";
import { scanVaultFolder } from "@/lib/vault/read";
import { connectVault, disconnectVault, ensureVaultPermission, getVaultMeta } from "@/lib/vault/store";
import { resolveVaultConflict, syncFromVault } from "@/lib/vault/sync";
import { writeAllEntriesToVault } from "@/lib/vault/write";
import { importNotionFiles } from "@/lib/notionImport";

/** Tell the app what the folder changed so the sidebar and index stay current. */
function publishEntries(entries: Entry[]): void {
  window.dispatchEvent(new CustomEvent("nw:vault-synced", { detail: entries }));
}

const DEFAULT_STORAGE_OPTIONS: Array<{
  value: DefaultContentStorage;
  label: string;
  description: string;
  Icon: typeof Cloud;
}> = [
  {
    value: "cloud",
    label: "Always cloud",
    description: "Shareable · synced across devices",
    Icon: Cloud,
  },
  {
    value: "local",
    label: "Always local",
    description: "Private · requires a vault folder",
    Icon: HardDrive,
  },
  {
    value: "ask",
    label: "Ask each time",
    description: "Pick cloud or local when you create a page",
    Icon: CircleHelp,
  },
];

export function VaultSettings({ userId }: { userId: string | null }) {
  const [meta, setMeta] = useState<VaultMetaRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<VaultConflict[]>([]);
  const [defaultStorage, setDefaultStorage] = useState<DefaultContentStorage>("cloud");
  const notionInputRef = useRef<HTMLInputElement>(null);
  const accountImportRef = useRef<HTMLInputElement>(null);

  const loadExportableEntries = useCallback(async (): Promise<Entry[]> => {
    if (!userId) return [];
    const { entries } = await fetchEntries(userId);
    return hydrateLocalEntries(
      userId,
      entries.filter((e) => !e.deleted_at),
    );
  }, [userId]);

  const handleAccountExport = async () => {
    if (!userId) return;
    setBusy("export");
    try {
      const entries = await loadExportableEntries();
      const count = downloadAccountExport(entries);
      toast.success(`Downloaded ${count} page${count === 1 ? "" : "s"}`, {
        description: "Unzip the file, then import the folder to restore hierarchy and page links.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't export your pages");
    } finally {
      setBusy(null);
    }
  };

  const handleAccountImportPicker = async () => {
    if (!userId || !isVaultSupported()) return;
    setBusy("import");
    try {
      const handle = await window.showDirectoryPicker();
      const files = await scanVaultFolder(handle);
      if (!files.length) {
        toast.error("No markdown files found in that folder");
        return;
      }
      const { entries: existing } = await fetchEntries(userId);
      const hydrated = await hydrateLocalEntries(userId, existing);
      const { entries, created, updated } = await importVaultExportFiles(
        files,
        userId,
        hydrated,
        { allEntriesForLocalSave: hydrated },
      );
      publishEntries(entries);
      toast.success(`Imported folder · ${created} new · ${updated} updated`);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      console.error(err);
      toast.error("Couldn't import that folder");
    } finally {
      setBusy(null);
    }
  };

  const handleAccountImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    setBusy("import");
    try {
      const files = await vaultFilesFromFileList(picked);
      if (!files.length) {
        toast.error("No markdown files found");
        return;
      }
      const { entries: existing } = await fetchEntries(userId);
      const hydrated = await hydrateLocalEntries(userId, existing);
      const { entries, created, updated } = await importVaultExportFiles(
        files,
        userId,
        hydrated,
        { allEntriesForLocalSave: hydrated },
      );
      publishEntries(entries);
      toast.success(`Imported folder · ${created} new · ${updated} updated`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Couldn't import that folder");
    } finally {
      setBusy(null);
    }
  };

  const accountBackupSection = (
    <div className="rounded-lg border border-border-subtle p-3 space-y-3">
      <div>
        <p className="text-sm font-mono text-ink-1">Account backup</p>
        <p className="text-xs font-sans text-ink-2 mt-1">
          Download every page as a zip of <span className="font-mono">.md</span> files in vault layout — nested
          folders, <span className="font-mono">wings_id</span> frontmatter, and <span className="font-mono">#page:</span>{" "}
          links. Unzip and import the folder to restore hierarchy and connections.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!userId || busy != null}
          onClick={() => void handleAccountExport()}
          className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
        >
          <FolderDown className="h-3.5 w-3.5" />
          {busy === "export" ? "downloading…" : "download account backup"}
        </button>
        {isVaultSupported() ? (
          <button
            type="button"
            disabled={!userId || busy != null}
            onClick={() => void handleAccountImportPicker()}
            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
          >
            <FolderUp className="h-3.5 w-3.5" />
            {busy === "import" ? "importing…" : "import account folder"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!userId || busy != null}
            onClick={() => accountImportRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
          >
            <FolderUp className="h-3.5 w-3.5" />
            {busy === "import" ? "importing…" : "import account folder"}
          </button>
        )}
      </div>
      {!isVaultSupported() && (
        <p className="text-xs font-mono text-ink-3">
          Folder import needs Chrome or Edge, or pick files below after unzipping your backup.
        </p>
      )}
      <input
        ref={accountImportRef}
        type="file"
        className="hidden"
        accept=".md,.markdown,text/markdown"
        multiple
        // @ts-expect-error webkitdirectory is non-standard but widely supported for folder pick
        webkitdirectory=""
        onChange={(e) => void handleAccountImportFiles(e)}
      />
    </div>
  );

  const loadEntriesHydrated = useCallback(async () => {
    if (!userId) return [];
    const { entries } = await fetchEntries(userId);
    return hydrateLocalEntries(userId, entries);
  }, [userId]);

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

  const refresh = useCallback(async () => {
    if (!userId) return;
    setMeta(await getVaultMeta(userId));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConnect = async () => {
    if (!userId) return;
    setBusy("connect");
    try {
      const row = await connectVault(userId);
      if (!row) {
        toast.error("Couldn't connect vault folder");
        return;
      }
      setMeta(row);
      toast.success(`Connected to “${row.folderName}”`);
    } catch (err) {
      console.error(err);
      toast.error("Vault connection cancelled or failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    if (!userId) return;
    await disconnectVault(userId);
    setMeta(null);
    setConflicts([]);
    toast.success("Vault disconnected");
  };

  const handleSync = async () => {
    if (!userId || !meta?.handle) return;
    setBusy("sync");
    try {
      if (!(await ensureVaultPermission(meta))) {
        toast.error("Vault folder permission denied");
        return;
      }
      // Read from the server rather than the local mirror: the mirror lags a
      // second behind typing, and comparing against stale content is what makes
      // a sync overwrite work the user just did.
      const entries = await loadEntriesHydrated();
      const { result } = await syncFromVault(userId, meta.handle, entries, meta, publishEntries);
      setConflicts(result.conflicts);
      await refresh();
      const summary = `${result.created} created · ${result.updated} updated`;
      if (result.conflicts.length > 0) {
        toast.warning(`Sync finished with ${result.conflicts.length} conflicts`, {
          description: `${summary} · resolve the conflicts below`,
        });
      } else {
        toast.success(`Sync complete · ${summary}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Vault sync failed");
    } finally {
      setBusy(null);
    }
  };

  const handleResolve = async (conflict: VaultConflict, winner: "page" | "file") => {
    if (!userId || !meta?.handle) return;
    setBusy(conflict.entryId);
    try {
      const entries = await loadEntriesHydrated();
      const resolved = await resolveVaultConflict(userId, meta.handle, conflict, winner, entries, meta);
      publishEntries(resolved.entries);
      setMeta(resolved.meta);
      setConflicts((current) => current.filter((c) => c.entryId !== conflict.entryId));
      toast.success(winner === "page" ? "Folder updated from Wings" : "Page updated from the folder");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't resolve the conflict");
    } finally {
      setBusy(null);
    }
  };

  const handleWriteAll = async () => {
    if (!userId || !meta?.handle) return;
    setBusy("write");
    try {
      if (!(await ensureVaultPermission(meta))) {
        toast.error("Vault folder permission denied");
        return;
      }
      const entries = await loadEntriesHydrated();
      const next = await writeAllEntriesToVault(meta.handle, entries, meta);
      setMeta(next);
      toast.success(`Wrote ${entries.length} pages to vault`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't write pages to vault");
    } finally {
      setBusy(null);
    }
  };

  const handleNotionImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy("notion");
    try {
      const created = await importNotionFiles(files, userId);
      const { entries } = await fetchEntries(userId);
      publishEntries(entries);
      toast.success(`Imported ${created.length} page${created.length === 1 ? "" : "s"} from Notion`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Notion import failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDismissError = async () => {
    if (!meta) return;
    const cleared = { ...meta, lastError: null };
    await putVaultMeta(cleared);
    setMeta(cleared);
  };

  const handleDefaultStorageChange = async (value: DefaultContentStorage) => {
    if (!userId || value === defaultStorage) return;
    setDefaultStorage(value);
    const result = await updateUserPreferences(userId, { default_content_storage: value });
    if (!result.ok) {
      toast.error("Couldn't save preference", { description: result.error });
    }
  };

  const defaultStorageSection = (
    <div className="rounded-lg border border-border-subtle p-3 space-y-3">
      <div>
        <p className="text-sm font-mono text-ink-1">Default storage for new pages</p>
        <p className="text-xs font-sans text-ink-2 mt-1">
          Where page bodies go by default. You can still override per page when set to &quot;Ask each time&quot;.
        </p>
      </div>
      <div className="space-y-2" role="radiogroup" aria-label="Default storage for new pages">
        {DEFAULT_STORAGE_OPTIONS.map(({ value, label, description, Icon }) => {
          const selected = defaultStorage === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!userId || busy != null}
              onClick={() => void handleDefaultStorageChange(value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-accent-strong bg-accent-soft/40 ring-1 ring-accent-strong/20"
                  : "border-border-subtle hover:border-border hover:bg-accent-soft/20",
                (!userId || busy != null) && "cursor-not-allowed opacity-50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border",
                  selected
                    ? "border-accent-strong/30 bg-accent-strong/10 text-accent-strong"
                    : "border-border-subtle bg-surface-0 text-ink-2",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-mono text-ink-0">{label}</span>
                <span className="block text-xs font-sans text-ink-2">{description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!isVaultSupported()) {
    return (
      <div className="space-y-3">
        {accountBackupSection}
        {defaultStorageSection}
        <p className="text-sm text-ink-1 font-sans">
          Export happens per-page from the editor toolbar, or export everything from the sidebar.
        </p>
        <div className="rounded-lg border border-border-subtle p-3 text-xs font-mono text-ink-2">
          Vault folder sync requires Chrome or Edge. Use export/import here or in the editor on this browser.
        </div>
        <button
          type="button"
          disabled={!userId || busy != null}
          onClick={() => notionInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
        >
          <FileDown className="h-3.5 w-3.5" />
          {busy === "notion" ? "importing…" : "import from Notion"}
        </button>
        <input
          ref={notionInputRef}
          type="file"
          className="hidden"
          accept=".md,.markdown,.csv,text/markdown,text/csv"
          multiple
          onChange={(e) => void handleNotionImport(e)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accountBackupSection}
      {defaultStorageSection}
      <p className="text-sm text-ink-1 font-sans">
        Connect a local folder to mirror pages as <span className="font-mono">.md</span> files. Wings stays
        authoritative — sync pulls only when files are newer.
      </p>
      {meta?.handle ? (
        <div className="rounded-lg border border-border-subtle p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-mono">
            <FolderOpen className="h-4 w-4" />
            <span>{meta.folderName}</span>
          </div>
          {meta.lastError && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2.5 space-y-1.5">
              <div className="flex items-start gap-2 text-xs font-mono text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Pages stopped mirroring to this folder: {meta.lastError.message}</span>
              </div>
              <button
                type="button"
                onClick={() => void handleDismissError()}
                className="text-xs font-mono underline text-ink-2 hover:text-ink-1"
              >
                dismiss
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void handleSync()}
              className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {busy === "sync" ? "syncing…" : "sync from folder"}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void handleWriteAll()}
              className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {busy === "write" ? "writing…" : "write all pages"}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-mono text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Unplug className="h-3.5 w-3.5" />
              disconnect
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!userId || busy != null}
          onClick={() => void handleConnect()}
          className="inline-flex items-center gap-2 rounded bg-accent-strong text-accent-strong-foreground text-xs font-mono px-4 py-2 hover:bg-accent-strong-hover disabled:opacity-50"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {busy === "connect" ? "connecting…" : "connect vault folder"}
        </button>
      )}

      {conflicts.length > 0 && (
        <div className="rounded-lg border border-border-subtle p-3 space-y-3">
          <p className="text-xs font-mono text-ink-2">
            These pages changed in Wings and in the folder. Nothing was overwritten — pick which version to keep.
          </p>
          {conflicts.map((conflict) => (
            <div key={conflict.entryId} className="rounded border border-border-subtle p-2.5 space-y-2">
              <div className="text-sm font-mono truncate">{conflict.title}</div>
              <div className="text-xs font-mono text-ink-3 truncate">{conflict.relativePath}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void handleResolve(conflict, "page")}
                  className="rounded border border-border px-2.5 py-1 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
                >
                  keep Wings version
                </button>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void handleResolve(conflict, "file")}
                  className="rounded border border-border px-2.5 py-1 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
                >
                  keep folder version
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border-subtle p-3 space-y-2">
        <p className="text-sm text-ink-1 font-sans">
          Import a Notion export (Markdown &amp; CSV). Pick the unzipped folder or select the
          exported <span className="font-mono">.md</span> / <span className="font-mono">.csv</span>{" "}
          files.
        </p>
        <button
          type="button"
          disabled={!userId || busy != null}
          onClick={() => notionInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-mono hover:bg-accent-soft/40 disabled:opacity-50"
        >
          <FileDown className="h-3.5 w-3.5" />
          {busy === "notion" ? "importing…" : "import from Notion"}
        </button>
        <input
          ref={notionInputRef}
          type="file"
          className="hidden"
          accept=".md,.markdown,.csv,text/markdown,text/csv"
          multiple
          onChange={(e) => void handleNotionImport(e)}
        />
      </div>

      <div className="rounded-lg border border-border-subtle p-3 text-xs font-mono text-ink-2">
        export formats: markdown (.md), json (.json) · saves mirror to the connected folder automatically
      </div>
    </div>
  );
}
