// Notion markdown / CSV export → Wings pages.
//
// Notion's "Export → Markdown & CSV" produces one `.md` per page (sometimes
// nested in folders) and `.csv` for databases. We turn markdown into pages and
// CSV tables into inline database blocks so the import lands as editable Wings
// content rather than a flat dump.

import { createEntry } from "@/lib/journal";
import type { Entry } from "@/lib/journal";
import { defaultDatabaseAttrs, type DatabaseColumn, type DatabaseRow } from "@/components/BlockEditor/DatabaseExtension";
import { isHtmlFileName, parseHtmlImport, stripExportTitleId } from "@/lib/htmlImport";

export interface NotionImportItem {
  title: string;
  content: string;
  /** Relative path inside the export, used to rebuild parent/child. */
  relativePath?: string;
}

/** Strip Notion's trailing UUID from page titles: `My Page abcdef123456...`. */
export function stripNotionTitleId(title: string): string {
  const withoutId = title.replace(/\s+[a-f0-9]{32}$/i, "");
  if (withoutId === title) return title.trim();
  return withoutId.replace(/\s+[—–-]\s*$/, "").trim() || title.trim();
}

/**
 * Notion markdown often starts with the title as an H1 and uses callout /
 * toggle syntax we map to Wings equivalents when possible.
 */
export function normalizeNotionMarkdown(raw: string, fallbackTitle?: string): { title: string; body: string } {
  let text = raw.replace(/^\uFEFF/, "").trim();
  // Notion page mentions: [Page Name](Page%20Name%20uuid.md) → [[Page Name]]
  text = text.replace(/\[([^\]]+)\]\(([^)]+\.(?:md|markdown|html|htm))\)/gi, (_m, label) => `[[${stripNotionTitleId(String(label))}]]`);
  // Notion callouts: <aside>…</aside> or > [!NOTE]
  text = text.replace(/<aside>\s*([\s\S]*?)\s*<\/aside>/gi, (_m, inner) => {
    const clean = String(inner).replace(/<[^>]+>/g, "").trim();
    return `\n\n<div data-type="callout" data-emoji="💡"><p>${clean}</p></div>\n\n`;
  });

  const h1 = text.match(/^#\s+(.+)\n?/);
  let title = fallbackTitle ? stripNotionTitleId(fallbackTitle) : "Untitled";
  let body = text;
  if (h1) {
    title = stripNotionTitleId(h1[1]);
    body = text.slice(h1[0].length).trim();
  } else if (fallbackTitle) {
    body = text;
  }

  if (title && !body.startsWith("#")) {
    body = `# ${title}\n\n${body}`.trim();
  }
  return { title, body };
}

/** Parse a Notion (or generic) CSV into a database block HTML snippet. */
export function csvToDatabaseHtml(csv: string): string {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    const empty = defaultDatabaseAttrs();
    return databaseAttrsToHtml(empty.columns, empty.rows);
  }

  const headers = splitCsvLine(lines[0]);
  const columns: DatabaseColumn[] = headers.map((name, i) => ({
    id: `col-${i}`,
    name: name || `Column ${i + 1}`,
    type: inferColumnType(name),
  }));

  const rows: DatabaseRow[] = lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line);
    const record: Record<string, string> = {};
    columns.forEach((col, idx) => {
      record[col.id] = cells[idx] ?? "";
    });
    return { id: `row-${i}`, cells: record };
  });

  return databaseAttrsToHtml(columns, rows.length ? rows : defaultDatabaseAttrs().rows);
}

function inferColumnType(name: string): DatabaseColumn["type"] {
  const lower = name.toLowerCase();
  if (lower.includes("status")) return "status";
  if (lower.includes("date") || lower.includes("when")) return "date";
  return "text";
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function databaseAttrsToHtml(columns: DatabaseColumn[], rows: DatabaseRow[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<div data-type="database" data-columns="${esc(JSON.stringify(columns))}" data-rows="${esc(JSON.stringify(rows))}"></div>`;
}

/**
 * Build parent relationships from export-relative paths.
 *
 * `Folder/Child.md` nests under the page created from `Folder.md` (or
 * `Folder/index.md`) when present; otherwise under the nearest path prefix.
 */
export function parentKeyForNotionPath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) return null;
  const dir = normalized.slice(0, lastSlash);
  return `${dir}.md`;
}

export async function importNotionItems(
  userId: string,
  items: NotionImportItem[],
): Promise<Entry[]> {
  // Shallow paths first so parents exist before children.
  const sorted = [...items].sort(
    (a, b) => (a.relativePath?.split("/").length ?? 1) - (b.relativePath?.split("/").length ?? 1),
  );
  const idByPath = new Map<string, string>();
  const created: Entry[] = [];

  for (const item of sorted) {
    const path = item.relativePath?.replace(/\\/g, "/");
    const parentPath = path ? parentKeyForNotionPath(path) : null;
    const parentId = parentPath ? idByPath.get(parentPath) : undefined;
    const { body } = normalizeNotionMarkdown(item.content, item.title);
    const entry = await createEntry(userId, body, parentId);
    created.push(entry);
    if (path) idByPath.set(path, entry.id);
  }

  return created;
}

export async function importNotionFiles(files: File[], userId: string): Promise<Entry[]> {
  const items: NotionImportItem[] = [];

  for (const file of files) {
    const name = file.name;
    const lower = name.toLowerCase();
    const text = await file.text();
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || name;

    if (lower.endsWith(".csv")) {
      const title = stripNotionTitleId(name.replace(/\.csv$/i, ""));
      const dbHtml = csvToDatabaseHtml(text);
      items.push({
        title,
        content: `# ${title}\n\n${dbHtml}`,
        relativePath: relativePath.replace(/\.csv$/i, ".md"),
      });
      continue;
    }

    if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
      const base = name.replace(/\.(md|markdown|txt)$/i, "");
      items.push({
        title: stripNotionTitleId(base),
        content: text,
        relativePath,
      });
      continue;
    }

    if (isHtmlFileName(name)) {
      const base = name.replace(/\.html?$/i, "");
      const parsed = parseHtmlImport(text, stripExportTitleId(base));
      items.push({
        title: parsed.title,
        content: parsed.body,
        relativePath: relativePath.replace(/\.html?$/i, ".md"),
      });
    }
  }

  if (items.length === 0) throw new Error("No Notion markdown, HTML, or CSV files found");
  return importNotionItems(userId, items);
}

/** True when the picker looks like a Notion zip (several pages, CSV, or UUID filenames). */
export function looksLikeNotionExport(files: File[]): boolean {
  if (files.length > 1) return true;
  return files.some(
    (f) => /\.csv$/i.test(f.name) || /\s[a-f0-9]{32}\.(md|markdown|html|htm)$/i.test(f.name),
  );
}
