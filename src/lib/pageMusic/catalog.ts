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
 * License documents for `licenseId` are listed on the legal page separately.
 */
export const PAGE_MUSIC_CATALOG: CatalogTrack[] = [];

export function catalogTracksInGroup(group: MusicGroupId): CatalogTrack[] {
  return PAGE_MUSIC_CATALOG.filter((track) => track.group === group);
}

export function catalogTrackById(id: string): CatalogTrack | null {
  return PAGE_MUSIC_CATALOG.find((track) => track.id === id) ?? null;
}
