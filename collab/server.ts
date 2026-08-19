/**
 * Wings realtime collaboration server (Hocuspocus + Yjs).
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auth + persistence
 *   COLLAB_PORT (default 1234)
 *   COLLAB_ALLOWED_ORIGINS — comma-separated
 *
 * Run: cd collab && npm install && npm run dev
 */

import { Server, type onAuthenticatePayload } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { createClient } from "@supabase/supabase-js";
import { seedStateFromEntry } from "./seedDocument.ts";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl || !serviceKey) {
  console.error("collab: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey);

const allowedOrigins = (process.env.COLLAB_ALLOWED_ORIGINS ?? process.env.SITE_URL ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.error("collab: set COLLAB_ALLOWED_ORIGINS or SITE_URL");
  process.exit(1);
}

function parseEntryId(documentName: string): string | null {
  const m = documentName.match(/^entry:([0-9a-f-]{36})$/i);
  return m ? m[1] : null;
}

async function canEditEntry(entryId: string, userId: string, email: string): Promise<boolean> {
  const { data: entry } = await admin
    .from("entries")
    .select("user_id")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return false;
  if (entry.user_id === userId) return true;

  const { data: share } = await admin
    .from("entry_shares")
    .select("role")
    .eq("entry_id", entryId)
    .or(`shared_with_user_id.eq.${userId},shared_with_email.eq.${email.toLowerCase()}`)
    .in("role", ["editor", "admin"])
    .maybeSingle();
  return !!share;
}

function parseBytea(raw: unknown): Uint8Array | null {
  if (!raw) return null;
  if (raw instanceof Uint8Array) return raw;
  if (typeof raw === "string") {
    const hex = raw.startsWith("\\x") ? raw.slice(2) : raw;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  return new Uint8Array(raw as ArrayBuffer);
}

const server = new Server({
  port: Number(process.env.COLLAB_PORT ?? 1234),
  debounce: 2000,
  maxDebounce: 10000,

  async onAuthenticate({ token, documentName, requestHeaders }: onAuthenticatePayload) {
    const origin = requestHeaders.get("origin") ?? "";
    if (origin && !allowedOrigins.includes(origin)) {
      throw new Error("origin not allowed");
    }

    const entryId = parseEntryId(documentName);
    if (!entryId) throw new Error("invalid document");

    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user?.id || !user.email) throw new Error("unauthorized");

    const ok = await canEditEntry(entryId, user.id, user.email);
    if (!ok) throw new Error("forbidden");

    return { user: { id: user.id, name: user.email.split("@")[0] || user.email } };
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const entryId = parseEntryId(documentName);
        if (!entryId) return null;
        const { data } = await admin
          .from("entries")
          .select("content_yjs, content, content_json")
          .eq("id", entryId)
          .maybeSingle();

        const existing = parseBytea(data?.content_yjs);
        if (existing?.length) return existing;

        const seeded = seedStateFromEntry(data?.content ?? "", data?.content_json);
        if (!seeded?.length) return null;

        // Persist once so later fetches use binary history, not re-seed from JSON.
        await admin
          .from("entries")
          .update({ content_yjs: Buffer.from(seeded) })
          .eq("id", entryId);

        return seeded;
      },
      store: async ({ documentName, state }) => {
        const entryId = parseEntryId(documentName);
        if (!entryId) return;
        await admin
          .from("entries")
          .update({ content_yjs: Buffer.from(state) })
          .eq("id", entryId);
      },
    }),
  ],
});

server.listen();
console.log(`Wings collab listening on :${process.env.COLLAB_PORT ?? 1234}`);
