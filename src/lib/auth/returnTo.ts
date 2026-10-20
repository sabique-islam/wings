const STORAGE_KEY = "wings.returnTo";
const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_LENGTH = 4000;

/** Same-origin in-app path, including a query string. Rejects open redirects. */
export function isSafeReturnTo(path: string): boolean {
  if (path.length === 0 || path.length > MAX_LENGTH) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  if (path.includes("\\")) return false;
  if (/[\u0000-\u001F\u007F]/.test(path)) return false;
  const pathname = path.split("?")[0] ?? "";
  if (pathname.includes(":") || pathname.includes("//")) return false;
  return true;
}

/** Remember the post-login path. Magic-link emails open a new tab, so this is localStorage. */
export function stashReturnTo(path: string): void {
  if (!isSafeReturnTo(path)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // Private mode can reject storage. The query string on /auth still works for the same tab.
  }
}

/** Read and clear a return path stashed before the OAuth or magic-link round trip. */
export function takeReturnTo(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof parsed.path !== "string" || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    if (!isSafeReturnTo(parsed.path)) return null;
    return parsed.path;
  } catch {
    return null;
  }
}
