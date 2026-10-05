import { describe, expect, it } from "vitest";
import { MUSIC_GROUPS, catalogTrackById, catalogTracksInGroup } from "./catalog";
import { audioExtension, audioFileError, describeAudioUpload, MAX_PAGE_AUDIO_BYTES } from "./audioFile";
import {
  entryPropertiesUpdate,
  pageSongKey,
  playbackOnPageChange,
  readPageSong,
  withPageSong,
  type PageSong,
} from "./pageSong";

const catalogSong: PageSong = { source: "catalog", id: "rain" };
const uploadSong: PageSong = { source: "upload", path: "user/page/track.mp3", name: "Track" };

describe("page music catalogue", () => {
  it("lists every group and the public-domain tracks", () => {
    expect(MUSIC_GROUPS.map((group) => group.label)).toEqual(["Soothing", "Lofi", "Simple", "NCS"]);
    expect(catalogTracksInGroup("soothing").map((item) => item.id)).toEqual([
      "calm-currents",
      "tranquil-mindscape",
      "into-the-mist",
    ]);
    expect(catalogTracksInGroup("lofi")).toHaveLength(3);
    expect(catalogTracksInGroup("simple")).toHaveLength(3);
    expect(catalogTracksInGroup("ncs")).toEqual([]);
    expect(catalogTrackById("calm-currents")).toMatchObject({
      artist: "HoliznaCC0",
      src: "/music/soothing/calm-currents.mp3",
      licenseId: "cc0-1.0",
    });
    expect(catalogTrackById("missing")).toBeNull();
  });
});

describe("page song assignment", () => {
  it("reads only a valid song and ignores the page body", () => {
    expect(readPageSong({ pageSong: catalogSong, content: "do not use" })).toEqual(catalogSong);
    expect(readPageSong({ pageSong: { source: "catalog" } })).toBeNull();
    expect(readPageSong(null)).toBeNull();
  });

  it("stores the song beside other properties and can clear it", () => {
    const saved = withPageSong({ status: "draft" }, uploadSong);
    expect(saved).toEqual({ status: "draft", pageSong: uploadSong });
    expect(saved).not.toHaveProperty("content");
    expect(saved).not.toHaveProperty("content_json");
    expect(withPageSong(saved, null)).toEqual({ status: "draft" });
  });

  it("sends properties alone when saving", () => {
    const payload = entryPropertiesUpdate({ pageSong: catalogSong });
    expect(payload).toEqual({ properties: { pageSong: catalogSong } });
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("content_json");
  });

  it("treats the same catalogue or upload as one track", () => {
    expect(pageSongKey(catalogSong)).toBe("catalog:rain");
    expect(pageSongKey({ ...catalogSong })).toBe(pageSongKey(catalogSong));
    expect(pageSongKey(uploadSong)).not.toBe(pageSongKey(catalogSong));
  });
});

describe("playback when the page changes", () => {
  it("keeps playing when the next page uses the same song", () => {
    expect(playbackOnPageChange({
      playing: true,
      currentKey: pageSongKey(catalogSong),
      nextSong: { ...catalogSong },
    })).toBe("keep");
  });

  it("asks when the next page has a different song or none", () => {
    expect(playbackOnPageChange({
      playing: true,
      currentKey: pageSongKey(catalogSong),
      nextSong: uploadSong,
    })).toBe("ask");
    expect(playbackOnPageChange({
      playing: true,
      currentKey: pageSongKey(catalogSong),
      nextSong: null,
    })).toBe("ask");
  });

  it("asks once for a play, then keeps going until the song is paused", () => {
    const first = playbackOnPageChange({
      playing: true,
      currentKey: pageSongKey(catalogSong),
      nextSong: uploadSong,
      alreadyAsked: false,
    });
    const later = playbackOnPageChange({
      playing: true,
      currentKey: pageSongKey(catalogSong),
      nextSong: null,
      alreadyAsked: true,
    });
    const afterPause = playbackOnPageChange({
      playing: false,
      currentKey: pageSongKey(catalogSong),
      nextSong: uploadSong,
      alreadyAsked: false,
    });
    expect(first).toBe("ask");
    expect(later).toBe("keep");
    expect(afterPause).toBe("keep");
  });

  it("stays quiet when nothing is playing", () => {
    expect(playbackOnPageChange({
      playing: false,
      currentKey: pageSongKey(catalogSong),
      nextSong: null,
    })).toBe("keep");
  });
});

describe("uploaded audio", () => {
  it("accepts the supported types under 20 MB", () => {
    expect(audioExtension("audio/mpeg")).toBe("mp3");
    expect(audioExtension("audio/x-m4a")).toBe("m4a");
    expect(audioFileError(new File(["a"], "song.txt", { type: "text/plain" }))).toMatch(/mp3/);
    const huge = new File([new Uint8Array(1)], "song.mp3", { type: "audio/mpeg" });
    Object.defineProperty(huge, "size", { value: MAX_PAGE_AUDIO_BYTES + 1 });
    expect(audioFileError(huge)).toMatch(/20 MB/);
  });

  it("treats an mp3 as audio/mpeg even when the browser type is blank or audio/mp3", () => {
    expect(describeAudioUpload(new File(["a"], "Human_Nature.mp3", { type: "" }))).toEqual({
      ext: "mp3",
      contentType: "audio/mpeg",
    });
    expect(describeAudioUpload(new File(["a"], "Human_Nature.mp3", { type: "audio/mp3" }))).toEqual({
      ext: "mp3",
      contentType: "audio/mpeg",
    });
  });
});
