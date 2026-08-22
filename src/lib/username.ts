import { supabase } from "@/integrations/supabase/client";

export const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,29})$/;

export const RESERVED_USERNAMES = new Set([
  "admin", "root", "auth", "login", "logout", "signup", "signin",
  "api", "app", "n", "s", "pricing", "about", "careers", "blog",
  "contact", "changelog", "roadmap", "docs", "support", "status",
  "press", "legal", "privacy", "terms", "security", "cookies",
  "settings", "account", "profile", "user", "users", "team",
  "dashboard", "home", "help", "sitemap", "robots", "well-known",
  "llms", "llms-full", "openapi",
  "c", "trash",
  "billing", "checkout", "pay", "payments", "404", "500",
]);

export interface UsernameCheckResult {
  ok: boolean;
  reason?: "invalid" | "reserved" | "taken" | "too_short" | "too_long";
  message?: string;
}

export function validateUsername(raw: string): UsernameCheckResult {
  const u = raw.trim().toLowerCase();
  if (u.length < 2) return { ok: false, reason: "too_short", message: "min 2 characters" };
  if (u.length > 30) return { ok: false, reason: "too_long", message: "max 30 characters" };
  if (!USERNAME_REGEX.test(u)) return { ok: false, reason: "invalid", message: "letters, numbers, _ and - only" };
  if (RESERVED_USERNAMES.has(u)) return { ok: false, reason: "reserved", message: "this name is reserved" };
  return { ok: true };
}

export type UsernameAvailabilityStatus =
  | "invalid"
  | "reserved"
  | "too_short"
  | "too_long"
  | "taken"
  | "available";

export interface UsernameAvailabilityResult {
  status: UsernameAvailabilityStatus;
  message: string;
}

/** Low-level probe: available | taken | error (RPC/network failure). */
export async function probeUsernameAvailability(
  username: string,
  excludeUserId?: string,
): Promise<"available" | "taken" | "error"> {
  const u = username.trim().toLowerCase();
  const { data, error } = await supabase.rpc("is_username_available", {
    _username: u,
    _exclude_user_id: excludeUserId ?? undefined,
  });
  if (error) return "error";
  return data === true ? "available" : "taken";
}

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  // Fail closed: treat lookup errors as "not available" so we never hand out a
  // name we couldn't verify.
  return (await probeUsernameAvailability(username, excludeUserId)) === "available";
}

type AvailabilityLookup = (
  username: string,
  excludeUserId?: string,
) => Promise<"available" | "taken" | "error">;

/** Local format/reserved check, then index-backed RPC availability. */
export async function checkUsernameAvailability(
  raw: string,
  excludeUserId?: string,
  lookup: AvailabilityLookup = probeUsernameAvailability,
): Promise<UsernameAvailabilityResult> {
  const check = validateUsername(raw);
  if (!check.ok) {
    return {
      status: check.reason ?? "invalid",
      message: check.message || "invalid username",
    };
  }

  const result = await lookup(raw.trim().toLowerCase(), excludeUserId);
  if (result === "error") {
    return { status: "taken", message: "couldn't verify" };
  }
  if (result === "taken") {
    return { status: "taken", message: "username already taken" };
  }
  return { status: "available", message: "available" };
}
