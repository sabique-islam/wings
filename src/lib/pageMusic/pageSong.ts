import { catalogTrackById } from "./catalog";

export type PageSong =
  | { source: "catalog"; id: string }
  | { source: "upload"; path: string; name: string };

export function localAudioPath(entryId: string): string {
  return `local:${entryId}`;
}

export function isLocalAudioPath(path: string): boolean {
  return path.startsWith("local:");
}

export function pageSongKey(song: PageSong | null | undefined): string | null {
  if (!song) return null;
  if (song.source === "catalog") return `catalog:${song.id}`;
  return `upload:${song.path}`;
}

export function readPageSong(properties: unknown): PageSong | null {
  if (!properties || typeof properties !== "object") return null;
  const song = (properties as { pageSong?: unknown }).pageSong;
  if (!song || typeof song !== "object") return null;
  const record = song as { source?: unknown; id?: unknown; path?: unknown; name?: unknown };
  if (record.source === "catalog" && typeof record.id === "string" && record.id.length > 0) {
    return { source: "catalog", id: record.id };
  }
  if (
    record.source === "upload" &&
    typeof record.path === "string" &&
    record.path.length > 0 &&
    typeof record.name === "string" &&
    record.name.length > 0
  ) {
    return { source: "upload", path: record.path, name: record.name };
  }
  return null;
}

export function pageSongTitle(song: PageSong | null | undefined): string {
  if (!song) return "No song";
  if (song.source === "upload") return song.name;
  return catalogTrackById(song.id)?.title ?? "Unavailable track";
}

/** Merge a song into page properties. Passing null clears only `pageSong`. */
export function withPageSong(properties: unknown, song: PageSong | null): Record<string, unknown> {
  const current =
    properties && typeof properties === "object" && !Array.isArray(properties)
      ? { ...(properties as Record<string, unknown>) }
      : {};
  if (!song) {
    delete current.pageSong;
    return current;
  }
  current.pageSong = song;
  return current;
}

/**
 * The object sent to Supabase. Content columns are intentionally absent:
 * choosing a song must not rewrite the page body.
 */
export function entryPropertiesUpdate(properties: Record<string, unknown>): { properties: Record<string, unknown> } {
  return { properties };
}

export type PlaybackDecision = "keep" | "ask";

/** Whether a focused-page change should interrupt audio that is already playing. */
export function playbackOnPageChange(opts: {
  playing: boolean;
  currentKey: string | null;
  nextSong: PageSong | null;
}): PlaybackDecision {
  if (!opts.playing) return "keep";
  if (opts.currentKey && opts.currentKey === pageSongKey(opts.nextSong)) return "keep";
  return "ask";
}
