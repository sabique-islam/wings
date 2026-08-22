import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "@/lib/icons";
import type { FilterParams, CollectionInfo } from "@/lib/collections";
import { getEntryTitle, type Entry } from "@/lib/journal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Mode = "page" | "rule";

const FILTER_KEYS: Array<{ key: string; label: string }> = [
  { key: "title", label: "title" },
  { key: "favorite", label: "pinned" },
  { key: "updatedAt", label: "updated" },
  { key: "parent", label: "parent" },
];

function defaultFilter(key: string): FilterParams {
  switch (key) {
    case "favorite":
      return { type: "system", key, method: "is", value: "true" };
    case "updatedAt":
      return { type: "system", key, method: "within", value: "7" };
    case "parent":
      return { type: "system", key, method: "is-root" };
    default:
      return { type: "system", key: "title", method: "contains", value: "" };
  }
}

function methodsFor(key: string): Array<{ method: string; label: string }> {
  if (key === "title") {
    return [
      { method: "contains", label: "contains" },
      { method: "is", label: "is" },
    ];
  }
  if (key === "favorite") return [{ method: "is", label: "is" }];
  if (key === "updatedAt") return [{ method: "within", label: "within days" }];
  return [
    { method: "is-root", label: "is root" },
    { method: "is", label: "is" },
  ];
}

interface Props {
  open: boolean;
  draft: CollectionInfo | null;
  entries: Entry[];
  onOpenChange: (open: boolean) => void;
  onSave: (info: CollectionInfo) => void;
}

export function CollectionEditorDialog({ open, draft, entries, onOpenChange, onSave }: Props) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("page");
  const [filters, setFilters] = useState<FilterParams[]>([]);
  const [allowList, setAllowList] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !draft) return;
    setName(draft.name);
    setFilters(draft.rules.filters);
    setAllowList(draft.allowList);
    setMode(draft.rules.filters.length === 0 ? "page" : "rule");
  }, [open, draft]);

  const live = useMemo(() => entries.filter((entry) => !entry.deleted_at), [entries]);
  const nameEmpty = name.trim().length === 0;

  const toggleAllow = (id: string) => {
    setAllowList((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const save = () => {
    if (!draft || nameEmpty) return;
    onSave({
      ...draft,
      name: name.trim(),
      rules: { filters },
      allowList,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            {draft?.id ? "Edit collection" : "New collection"}
          </DialogTitle>
          <DialogDescription className="text-sm font-sans">
            Pages mode pins specific pages. Rules mode matches pages automatically. Dropped pages always stay pinned.
          </DialogDescription>
        </DialogHeader>

        <label className="block space-y-1">
          <span className="text-[11px] font-mono text-muted-foreground">name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(["page", "rule"] as const).map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => setMode(next)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-mono",
                mode === next ? "bg-accent-strong text-accent-strong-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {next === "page" ? "Pages" : "Rules"}
            </button>
          ))}
        </div>

        {mode === "page" ? (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {live.length === 0 ? (
              <li className="px-1 py-2 text-xs text-muted-foreground">no pages yet</li>
            ) : (
              live.map((entry) => (
                <li key={entry.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent-soft/30">
                    <input
                      type="checkbox"
                      checked={allowList.includes(entry.id)}
                      onChange={() => toggleAllow(entry.id)}
                    />
                    <span className="truncate">{getEntryTitle(entry)}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="space-y-2">
            {filters.map((filter, index) => (
              <FilterRow
                key={`${filter.key}-${index}`}
                filter={filter}
                entries={live}
                onChange={(next) => setFilters((prev) => prev.map((row, i) => (i === index ? next : row)))}
                onRemove={() => setFilters((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
            <button
              type="button"
              onClick={() => setFilters((prev) => [...prev, defaultFilter("title")])}
              className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> add rule
            </button>
          </div>
        )}

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
            disabled={nameEmpty}
            onClick={save}
            className="rounded bg-accent-strong px-3 py-1.5 text-xs font-mono text-accent-strong-foreground hover:bg-accent-strong-hover disabled:opacity-50"
          >
            save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterRow({
  filter,
  entries,
  onChange,
  onRemove,
}: {
  filter: FilterParams;
  entries: Entry[];
  onChange: (next: FilterParams) => void;
  onRemove: () => void;
}) {
  const methods = methodsFor(filter.key);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        value={filter.key}
        onChange={(e) => onChange(defaultFilter(e.target.value))}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono"
      >
        {FILTER_KEYS.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        value={filter.method}
        onChange={(e) => onChange({ ...filter, method: e.target.value, value: e.target.value === "is-root" ? undefined : filter.value })}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono"
      >
        {methods.map((item) => (
          <option key={item.method} value={item.method}>
            {item.label}
          </option>
        ))}
      </select>
      {filter.key === "title" && (
        <input
          value={filter.value ?? ""}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
          placeholder="text"
        />
      )}
      {filter.key === "favorite" && (
        <select
          value={filter.value ?? "true"}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )}
      {filter.key === "updatedAt" && (
        <input
          type="number"
          min={0}
          value={filter.value ?? "7"}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs"
        />
      )}
      {filter.key === "parent" && filter.method === "is" && (
        <select
          value={filter.value ?? ""}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">choose page</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {getEntryTitle(entry)}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"
        aria-label="Remove rule"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
