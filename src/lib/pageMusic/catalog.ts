export type MusicGroupId = "soothing" | "lofi" | "simple" | "ncs";

export type MusicGroup = {
  id: MusicGroupId;
  label: string;
};

export type CatalogTrack = {
  id: string;
  title: string;
  artist: string;
  group: MusicGroupId;
  /** Public path under /music. */
  src: string;
  licenseId: string;
};

export const MUSIC_GROUPS: MusicGroup[] = [
  { id: "soothing", label: "Soothing" },
  { id: "lofi", label: "Lofi" },
  { id: "simple", label: "Simple" },
  { id: "ncs", label: "NCS" },
];

/**
 * Built-in tracks. Audio files live in public/music and are registered here.
 * These nine are HoliznaCC0 tracks dedicated to the public domain (CC0 1.0)
 * via the Free Music Archive. `licenseId` is ready for the legal page.
 * NCS stays empty until those licensed files are added.
 */
export const PAGE_MUSIC_CATALOG: CatalogTrack[] = [
  track("calm-currents", "Calm Currents", "soothing"),
  track("tranquil-mindscape", "Tranquil Mindscape", "soothing"),
  track("into-the-mist", "Into the Mist", "soothing"),
  track("birds", "Birds", "lofi"),
  track("tokyo-sunset", "Tokyo Sunset", "lofi"),
  track("lucid", "Lucid", "lofi"),
  track("ocean-breeze", "Ocean Breeze", "simple"),
  track("bubbles", "Bubbles", "simple"),
  track("yet-again", "Yet Again", "simple"),
];

function track(id: string, title: string, group: MusicGroupId): CatalogTrack {
  return {
    id,
    title,
    artist: "HoliznaCC0",
    group,
    src: `/music/${group}/${id}.mp3`,
    licenseId: "cc0-1.0",
  };
}

export function catalogTracksInGroup(group: MusicGroupId): CatalogTrack[] {
  return PAGE_MUSIC_CATALOG.filter((track) => track.group === group);
}

export function catalogTrackById(id: string): CatalogTrack | null {
  return PAGE_MUSIC_CATALOG.find((track) => track.id === id) ?? null;
}
