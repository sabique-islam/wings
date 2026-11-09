import { createClient } from "@supabase/supabase-js";

export function makeSessionVerifier(url: string, publishableKey: string) {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return async function verifySession(accessToken: string): Promise<{ userId: string } | null> {
    if (!accessToken || accessToken.length > 8192) return null;
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return { userId: data.user.id };
  };
}
