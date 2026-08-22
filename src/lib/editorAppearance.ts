export const EDITOR_APPEARANCE_KEY = "nw:editor-appearance";
export const EDITOR_APPEARANCE_EVENT = "nw:editor-appearance";

export type EditorFontFamily = "sans" | "serif" | "mono";

export type EditorAppearance = {
  fontFamily: EditorFontFamily;
  fontSize: number;
  fullWidth: boolean;
  codeWrap: boolean;
};

export const DEFAULT_EDITOR_APPEARANCE: EditorAppearance = {
  fontFamily: "sans",
  fontSize: 16,
  fullWidth: false,
  codeWrap: false,
};

export const EDITOR_FONT_STACKS: Record<EditorFontFamily, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const FONT_FAMILIES = new Set<EditorFontFamily>(["sans", "serif", "mono"]);

/** Same 12–24 range as the appearance slider. */
export function clampEditorFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EDITOR_APPEARANCE.fontSize;
  return Math.min(24, Math.max(12, Math.round(value)));
}

export function parseEditorAppearance(raw: unknown): EditorAppearance {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fontFamily = FONT_FAMILIES.has(input.fontFamily as EditorFontFamily)
    ? (input.fontFamily as EditorFontFamily)
    : DEFAULT_EDITOR_APPEARANCE.fontFamily;
  return {
    fontFamily,
    fontSize: clampEditorFontSize(Number(input.fontSize)),
    fullWidth: input.fullWidth === true,
    codeWrap: input.codeWrap === true,
  };
}

export function fontStackFor(family: EditorFontFamily): string {
  return EDITOR_FONT_STACKS[family];
}

export function pageEditorWidthClass(fullWidth: boolean): string {
  return fullWidth ? "max-w-none" : "max-w-[708px]";
}

let memory: EditorAppearance | null = null;

export function loadEditorAppearance(): EditorAppearance {
  if (memory) return memory;
  if (typeof localStorage === "undefined") {
    memory = { ...DEFAULT_EDITOR_APPEARANCE };
    return memory;
  }
  try {
    const stored = localStorage.getItem(EDITOR_APPEARANCE_KEY);
    memory = stored ? parseEditorAppearance(JSON.parse(stored)) : { ...DEFAULT_EDITOR_APPEARANCE };
  } catch {
    memory = { ...DEFAULT_EDITOR_APPEARANCE };
  }
  return memory;
}

export function saveEditorAppearance(next: EditorAppearance): EditorAppearance {
  memory = parseEditorAppearance(next);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(EDITOR_APPEARANCE_KEY, JSON.stringify(memory));
  }
  applyEditorAppearanceCss(memory);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EDITOR_APPEARANCE_EVENT, { detail: memory }));
  }
  return memory;
}

export function patchEditorAppearance(patch: Partial<EditorAppearance>): EditorAppearance {
  return saveEditorAppearance({ ...loadEditorAppearance(), ...patch });
}

export function resetEditorAppearanceMemory(): void {
  memory = null;
}

/** New fences only. Existing blocks keep their wrap attr. */
export function defaultCodeWrap(): boolean {
  return loadEditorAppearance().codeWrap;
}

export function applyEditorAppearanceCss(settings: EditorAppearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--nw-editor-font", fontStackFor(settings.fontFamily));
  root.style.setProperty("--nw-editor-size", `${settings.fontSize}px`);
  root.dataset.editorFont = settings.fontFamily;
  root.dataset.editorFullWidth = settings.fullWidth ? "true" : "false";
  root.dataset.editorCodeWrap = settings.codeWrap ? "true" : "false";
}
