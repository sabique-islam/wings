export const MAX_PAGE_AUDIO_BYTES = 20 * 1024 * 1024;

const CANONICAL_TYPE: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
};

export function audioExtension(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null;
}

function extensionFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext in CANONICAL_TYPE ? ext : null;
}

/** Browser file inputs often label an mp3 as audio/mp3 or leave the type blank. */
export function describeAudioUpload(file: File): { ext: string; contentType: string } | null {
  const fromMime = MIME_TO_EXT[file.type];
  const fromName = extensionFromName(file.name);
  const ext = fromMime ?? (file.type === "" || file.type === "application/octet-stream" ? fromName : null);
  if (!ext) return null;
  const contentType = CANONICAL_TYPE[ext];
  if (!contentType) return null;
  return { ext, contentType };
}

export function audioFileError(file: File): string | null {
  if (!describeAudioUpload(file)) return "Use an mp3, wav, ogg, or m4a file.";
  if (file.size > MAX_PAGE_AUDIO_BYTES) return "Audio files must be 20 MB or smaller.";
  return null;
}
