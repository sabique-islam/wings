import { supabase } from "@/integrations/supabase/client";
import { authRedirectUrl } from "./auth/redirect";

function formatAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "too many sign-in emails — wait a minute and try again, or use Google sign-in.";
  }
  return message;
}

/**
 * Email + password sign-in. There is no password sign-up: only accounts given
 * a password in the Supabase dashboard (such as an app-review test account)
 * can use it. Reviewers can't receive magic links or email codes.
 */
export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (!error) return { error: null };
  const lower = error.message.toLowerCase();
  const message = lower.includes("invalid login credentials")
    ? "wrong email or password."
    : formatAuthError(error.message);
  return { error: { ...error, message } };
}

/** Magic link only (Supabase uses /auth/v1/otp for link + code flows). */
export async function sendMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: authRedirectUrl(),
      shouldCreateUser: true,
    },
  });
  return { error: error ? { ...error, message: formatAuthError(error.message) } : null };
}
