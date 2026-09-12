// Interface sounds via Cuelume. Preference lives on this device; Cuelume
// does not persist mute/volume itself.
//
// Two channels:
//   chrome     — app chrome (sidebar, settings, header, dialogs)
//   noteTools  — editor tools (slash, bubble, handles, find/replace)
// Master off silences both. noteTools can be muted on its own while writing.

import type { SoundName } from "cuelume";

export const UI_SOUNDS_KEY = "wings:ui-sounds";
export const UI_SOUNDS_NOTE_TOOLS_KEY = "wings:ui-sounds-note-tools";
export const UI_SOUNDS_EVENT = "wings:ui-sounds";
export const NOTE_TOOL_ATTR = "data-ui-sound";
export const NOTE_TOOL_VALUE = "note-tool";

export type UiSoundChannel = "chrome" | "noteTools";
export type UiSoundPrefs = { enabled: boolean; noteTools: boolean };

const DEFAULT_PREFS: UiSoundPrefs = { enabled: true, noteTools: true };
const VOLUME = 0.7;

const CLICKABLE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  "select",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="color"]',
  "[data-radix-collection-item]",
].join(",");

const NOTE_TOOL_SELECTOR = [
  `[${NOTE_TOOL_ATTR}="${NOTE_TOOL_VALUE}"]`,
  ".slash-menu",
  ".bubble-menu",
  ".table-menu",
  ".mobile-keyboard-toolbar",
  ".find-replace-bar",
  ".nw-block-handle",
  ".block-menu",
  ".tippy-box",
].join(",");

type CuelumeModule = typeof import("cuelume");

let modulePromise: Promise<CuelumeModule> | null = null;
let lectureSuspended = false;
let listening = false;

function readFlag(key: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // private mode
  }
  return fallback;
}

export function getUiSoundPrefs(): UiSoundPrefs {
  return {
    enabled: readFlag(UI_SOUNDS_KEY, DEFAULT_PREFS.enabled),
    noteTools: readFlag(UI_SOUNDS_NOTE_TOOLS_KEY, DEFAULT_PREFS.noteTools),
  };
}

export function isUiSoundsEnabled(): boolean {
  return getUiSoundPrefs().enabled;
}

export function isNoteToolSoundsEnabled(): boolean {
  const prefs = getUiSoundPrefs();
  return prefs.enabled && prefs.noteTools;
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
}

function emitPrefs(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UI_SOUNDS_EVENT, { detail: getUiSoundPrefs() }));
}

function masterWantsPlayback(): boolean {
  return getUiSoundPrefs().enabled && !lectureSuspended;
}

function loadCuelume(): Promise<CuelumeModule> {
  if (!modulePromise) modulePromise = import("cuelume");
  return modulePromise;
}

async function syncPlayback(): Promise<void> {
  const { setEnabled, setVolume } = await loadCuelume();
  setVolume(VOLUME);
  setEnabled(masterWantsPlayback());
}

function isTypingField(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = el.type || "text";
    return !["checkbox", "radio", "button", "submit", "reset", "color", "file", "range"].includes(type);
  }
  return el instanceof HTMLElement && el.isContentEditable && !el.closest(CLICKABLE_SELECTOR);
}

export function classifyUiSoundTarget(target: EventTarget | null): UiSoundChannel | null {
  if (!(target instanceof Element)) return null;
  const clickable = target.closest(CLICKABLE_SELECTOR);
  if (!clickable) return null;
  if (
    (clickable instanceof HTMLButtonElement && clickable.disabled) ||
    (clickable instanceof HTMLInputElement && clickable.disabled) ||
    clickable.getAttribute("aria-disabled") === "true"
  ) {
    return null;
  }
  if (isTypingField(clickable)) return null;
  if (clickable.closest(NOTE_TOOL_SELECTOR)) return "noteTools";
  return "chrome";
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const channel = classifyUiSoundTarget(event.target);
  if (!channel) return;
  playUiSound(channel === "noteTools" ? "tick" : "press", channel);
}

function onPointerUp(event: PointerEvent): void {
  if (event.button !== 0) return;
  const channel = classifyUiSoundTarget(event.target);
  if (channel !== "chrome") return;
  playUiSound("release", "chrome");
}

function installClickSounds(): void {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
}

export function startUiSounds(): void {
  installClickSounds();
  void syncPlayback();
}

export function setUiSoundsEnabled(enabled: boolean): void {
  writeFlag(UI_SOUNDS_KEY, enabled);
  void syncPlayback().then(() => {
    if (enabled && masterWantsPlayback()) playUiSound("toggle", "chrome");
  });
  emitPrefs();
}

export function setNoteToolSoundsEnabled(enabled: boolean): void {
  writeFlag(UI_SOUNDS_NOTE_TOOLS_KEY, enabled);
  emitPrefs();
  if (enabled && isNoteToolSoundsEnabled()) playUiSound("tick", "noteTools");
}

/** Mute Cuelume for the duration of a lecture recording. */
export function setUiSoundsSuspended(suspended: boolean): void {
  lectureSuspended = suspended;
  void syncPlayback();
}

export function playUiSound(name: SoundName, channel: UiSoundChannel = "chrome"): void {
  if (!masterWantsPlayback()) return;
  if (channel === "noteTools" && !getUiSoundPrefs().noteTools) return;
  void loadCuelume().then(({ play }) => play(name));
}

export function resetUiSoundsMemory(): void {
  lectureSuspended = false;
  modulePromise = null;
}
