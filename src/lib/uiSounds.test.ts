import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cuelume", () => ({
  bind: vi.fn(),
  play: vi.fn(),
  setEnabled: vi.fn(),
  setVolume: vi.fn(),
}));
import {
  NOTE_TOOL_ATTR,
  NOTE_TOOL_VALUE,
  UI_SOUNDS_KEY,
  UI_SOUNDS_NOTE_TOOLS_KEY,
  classifyUiSoundTarget,
  isNoteToolSoundsEnabled,
  isUiSoundsEnabled,
  resetUiSoundsMemory,
  setNoteToolSoundsEnabled,
  setUiSoundsEnabled,
} from "./uiSounds";

afterEach(() => {
  localStorage.removeItem(UI_SOUNDS_KEY);
  localStorage.removeItem(UI_SOUNDS_NOTE_TOOLS_KEY);
  resetUiSoundsMemory();
});

describe("uiSounds preference", () => {
  it("defaults to on for both channels", () => {
    expect(isUiSoundsEnabled()).toBe(true);
    expect(isNoteToolSoundsEnabled()).toBe(true);
  });

  it("master off silences note tools even if that flag stays on", () => {
    setNoteToolSoundsEnabled(true);
    setUiSoundsEnabled(false);
    resetUiSoundsMemory();
    expect(isUiSoundsEnabled()).toBe(false);
    expect(isNoteToolSoundsEnabled()).toBe(false);
  });

  it("can mute note tools while chrome stays on", () => {
    setUiSoundsEnabled(true);
    setNoteToolSoundsEnabled(false);
    resetUiSoundsMemory();
    expect(isUiSoundsEnabled()).toBe(true);
    expect(isNoteToolSoundsEnabled()).toBe(false);
  });
});

describe("classifyUiSoundTarget", () => {
  it("ignores typing in the page body", () => {
    const editor = document.createElement("div");
    editor.className = "ProseMirror";
    editor.contentEditable = "true";
    editor.textContent = "hello";
    document.body.append(editor);
    expect(classifyUiSoundTarget(editor)).toBeNull();
    editor.remove();
  });

  it("treats app chrome buttons as chrome", () => {
    const button = document.createElement("button");
    button.textContent = "Settings";
    document.body.append(button);
    expect(classifyUiSoundTarget(button)).toBe("chrome");
    button.remove();
  });

  it("treats marked editor tools as noteTools", () => {
    const menu = document.createElement("div");
    menu.setAttribute(NOTE_TOOL_ATTR, NOTE_TOOL_VALUE);
    const button = document.createElement("button");
    button.textContent = "Bold";
    menu.append(button);
    document.body.append(menu);
    expect(classifyUiSoundTarget(button)).toBe("noteTools");
    menu.remove();
  });

  it("treats slash and bubble menus as noteTools", () => {
    const slash = document.createElement("div");
    slash.className = "slash-menu";
    const item = document.createElement("button");
    slash.append(item);
    document.body.append(slash);
    expect(classifyUiSoundTarget(item)).toBe("noteTools");
    slash.remove();
  });

  it("skips disabled controls", () => {
    const button = document.createElement("button");
    button.disabled = true;
    document.body.append(button);
    expect(classifyUiSoundTarget(button)).toBeNull();
    button.remove();
  });
});
