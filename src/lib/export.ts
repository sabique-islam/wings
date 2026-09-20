import { Entry } from "@/lib/journal";
import { createEntry } from "@/lib/journal";
import { serializeVaultMarkdown, titleFromContent, slug } from "@/lib/vault/frontmatter";
import { isHtmlFileName, parseHtmlImport, stripExportTitleId } from "@/lib/htmlImport";

export function exportSingleEntry(entry: Entry): void {
  const title = titleFromContent(entry.content);
  download(serializeVaultMarkdown(entry), `${slug(title)}.md`, "text/markdown");
}

export function exportAllEntries(entries: Entry[]): void {
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const content = sorted.map((e) => serializeVaultMarkdown(e)).join("\n\n---\n\n");
  download(content, "wings-export.md", "text/markdown");
}

export function exportSingleAsJson(entry: Entry): void {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    entry: {
      id: entry.id,
      title: titleOf(entry),
      content: entry.content,
      pinned: entry.pinned,
      created_at: entry.created_at,
      parent_id: entry.parent_id,
    },
  };
  download(JSON.stringify(payload, null, 2), `${slug(titleOf(entry))}.json`, "application/json");
}

export function exportAllAsJson(entries: Entry[]): void {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    entries: entries.map((e) => ({
      id: e.id,
      title: titleOf(e),
      content: e.content,
      pinned: e.pinned,
      created_at: e.created_at,
      parent_id: e.parent_id,
    })),
  };
  download(JSON.stringify(payload, null, 2), "wings-export.json", "application/json");
}

export interface ImportedEntry {
  title?: string;
  content: string;
  parent_id?: string | null;
}

export function parseMarkdownImport(raw: string): ImportedEntry[] {
  // Files exported by exportAllEntries are separated by `\n---\n` between
  // frontmatter blocks. Split conservatively on lines that are exactly `---`.
  const blocks = raw.split(/\n-{3,}\n/g).map((b) => b.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    return [{ content: raw.trim() }];
  }
  const out: ImportedEntry[] = [];
  for (const block of blocks) {
    const fm = block.match(/^([\s\S]*?)\n([\s\S]+)$/);
    if (!fm) {
      out.push({ content: block });
      continue;
    }
    const head = fm[1];
    const body = fm[2];
    const titleMatch = head.match(/title:\s*(.+)/i);
    if (titleMatch) {
      out.push({ title: titleMatch[1].trim(), content: body.trim() });
    } else {
      out.push({ content: block });
    }
  }
  return out;
}

export function parseJsonImport(raw: string): ImportedEntry[] {
  const data = JSON.parse(raw);
  if (Array.isArray(data?.entries)) {
    return data.entries.map((e: any) => ({
      title: e.title,
      content: String(e.content ?? ""),
      parent_id: e.parent_id ?? null,
    }));
  }
  if (data?.entry) {
    return [{
      title: data.entry.title,
      content: String(data.entry.content ?? ""),
      parent_id: data.entry.parent_id ?? null,
    }];
  }
  if (Array.isArray(data)) {
    return data.map((e: any) => ({
      title: e.title,
      content: String(e.content ?? ""),
      parent_id: e.parent_id ?? null,
    }));
  }
  throw new Error("Unrecognised JSON shape");
}

export async function importFile(file: File, userId: string): Promise<Entry[]> {
  const text = await file.text();
  const lower = file.name.toLowerCase();
  const items = lower.endsWith(".json") || file.type.includes("json")
    ? parseJsonImport(text)
    : isHtmlFileName(file.name) || file.type.includes("html")
      ? [htmlImportItem(file.name, text)]
      : parseMarkdownImport(text);

  const created: Entry[] = [];
  for (const item of items) {
    const body = item.title && !item.content.startsWith("#")
      ? `# ${item.title}\n\n${item.content}`
      : item.content;
    const entry = await createEntry(userId, body, item.parent_id ?? undefined);
    created.push(entry);
  }
  return created;
}

function htmlImportItem(fileName: string, raw: string): ImportedEntry {
  const parsed = parseHtmlImport(raw, stripExportTitleId(fileName.replace(/\.html?$/i, "")));
  return { title: parsed.title, content: parsed.body };
}

function titleOf(entry: Entry): string {
  return entry.content.split("\n")[0].replace(/^#+\s*/, "").trim() || "untitled";
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
