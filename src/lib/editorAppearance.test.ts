import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_APPEARANCE,
  clampEditorFontSize,
  clearEditorAppearance,
  defaultCodeWrap,
  fontStackFor,
  loadEditorAppearance,
  pageEditorWidthClass,
  contentLooksFullWidth,
  parseEditorAppearance,
  patchEditorAppearance,
  resetEditorAppearanceMemory,
  saveEditorAppearance,
} from "./editorAppearance";

afterEach(() => {
  clearEditorAppearance();
});

describe("parseEditorAppearance", () => {
  it("uses defaults for garbage input", () => {
    expect(parseEditorAppearance(null)).toEqual(DEFAULT_EDITOR_APPEARANCE);
    expect(parseEditorAppearance("nope")).toEqual(DEFAULT_EDITOR_APPEARANCE);
    expect(parseEditorAppearance({ fontFamily: "Comic Sans", fontSize: 99, fullWidth: "yes" })).toEqual({
      fontFamily: "sans",
      fontSize: 24,
      fullWidth: false,
      codeWrap: false,
    });
  });

  it("keeps a valid payload", () => {
    expect(
      parseEditorAppearance({ fontFamily: "serif", fontSize: 18, fullWidth: true, codeWrap: true }),
    ).toEqual({
      fontFamily: "serif",
      fontSize: 18,
      fullWidth: true,
      codeWrap: true,
    });
  });
});

describe("clampEditorFontSize", () => {
  it("stays between 12 and 24", () => {
    expect(clampEditorFontSize(11)).toBe(12);
    expect(clampEditorFontSize(16)).toBe(16);
    expect(clampEditorFontSize(24)).toBe(24);
    expect(clampEditorFontSize(25)).toBe(24);
    expect(clampEditorFontSize(Number.NaN)).toBe(16);
  });
});

describe("pageEditorWidthClass", () => {
  it("drops the 708px cap when full width is on", () => {
    expect(pageEditorWidthClass(false)).toBe("max-w-[708px]");
    expect(pageEditorWidthClass(true)).toBe("max-w-none");
  });
});

describe("fontStackFor", () => {
  it("does not write a fontFamily mark — CSS stacks only", () => {
    expect(fontStackFor("serif")).toContain("Georgia");
    expect(fontStackFor("mono")).toContain("monospace");
  });
});

describe("localStorage round-trip", () => {
  it("persists and reloads without touching editor content", () => {
    saveEditorAppearance({ fontFamily: "mono", fontSize: 20, fullWidth: true, codeWrap: true });
    resetEditorAppearanceMemory();
    expect(loadEditorAppearance()).toEqual({
      fontFamily: "mono",
      fontSize: 20,
      fullWidth: true,
      codeWrap: true,
    });
  });

  it("reads the live code-wrap default for new fences", () => {
    expect(defaultCodeWrap()).toBe(false);
    patchEditorAppearance({ codeWrap: true });
    expect(defaultCodeWrap()).toBe(true);
  });
});

describe("contentLooksFullWidth", () => {
  it("detects planner grids in markdown or JSON", () => {
    expect(contentLooksFullWidth("hello")).toBe(false);
    expect(contentLooksFullWidth('div data-type="column-list"')).toBe(true);
    expect(contentLooksFullWidth("", { type: "doc", content: [{ type: "weekCard" }] })).toBe(true);
  });
});
