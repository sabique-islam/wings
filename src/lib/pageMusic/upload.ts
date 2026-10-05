import { supabase } from "@/integrations/supabase/client";
import { audioExtension, audioFileError } from "./audioFile";

const SIGNED_URL_TTL = 60 * 60 * 6;

export async function uploadPageAudio(file: File, userId: string, entryId: string): Promise<string> {
  const rejected = audioFileError(file);
  if (rejected) throw new Error(rejected);
  const ext = audioExtension(file.type);
  if (!ext) throw new Error("Use an mp3, wav, ogg, or m4a file.");

  const rand = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  const path = `${userId}/${entryId}/${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage
    .from("journal-audio")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Couldn't upload that audio file.");
  return path;
}

export async function pageAudioUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("journal-audio").createSignedUrl(path, SIGNED_URL_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}
