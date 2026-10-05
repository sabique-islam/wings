export const MAX_PAGE_AUDIO_BYTES = 20 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

export function audioExtension(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null;
}

export function audioFileError(file: File): string | null {
  if (!audioExtension(file.type)) return "Use an mp3, wav, ogg, or m4a file.";
  if (file.size > MAX_PAGE_AUDIO_BYTES) return "Audio files must be 20 MB or smaller.";
  return null;
}
