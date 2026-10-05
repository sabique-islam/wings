import { supabase } from "@/integrations/supabase/client";
import { audioFileError, describeAudioUpload } from "./audioFile";

const SIGNED_URL_TTL = 60 * 60 * 6;

export async function uploadPageAudio(file: File, userId: string, entryId: string): Promise<string> {
  const rejected = audioFileError(file);
  if (rejected) throw new Error(rejected);
  const described = describeAudioUpload(file);
  if (!described) throw new Error("Use an mp3, wav, ogg, or m4a file.");

  const rand = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  const path = `${userId}/${entryId}/${Date.now()}-${suffix}.${described.ext}`;
  // A File upload is sent as multipart and Storage ignores the contentType
  // option, then rejects the part type. Raw bytes keep the declared audio type.
  const bytes = await file.arrayBuffer();
  const { error } = await supabase.storage.from("journal-audio").upload(path, bytes, {
    contentType: described.contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message || "Couldn't upload that audio file.");
  return path;
}

export async function pageAudioUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("journal-audio").createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Couldn't open that audio file.");
  return data.signedUrl;
}
