/** Token formats are recognizable so secret scanners can flag leaks. Only the hash is stored. */

const TOKEN_RE = /^wings_(pat|oat|ort|oac)_([A-Za-z0-9_-]{22})_([A-Za-z0-9_-]{43})$/;

export type TokenKind = "pat" | "oat" | "ort" | "oac";

export interface ParsedToken {
  kind: TokenKind;
  /** Row id (uuid). Not a secret; the suffix is. */
  id: string;
  secret: string;
}

const KIND_PREFIX: Record<TokenKind, string> = {
  pat: "wings_pat_",
  oat: "wings_oat_",
  ort: "wings_ort_",
  oac: "wings_oac_",
};

const DUMMY_HASH = new Uint8Array(32);

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time compare for equal-length byte strings. */
export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

function uuidToBytes(id: string): Uint8Array | null {
  const hex = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return hexToBytes(hex);
}

function bytesToUuid(bytes: Uint8Array): string | null {
  if (bytes.length !== 16) return null;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function hmacSha256(pepper: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

export async function hmacHex(pepper: string, message: string): Promise<string> {
  return bytesToHex(await hmacSha256(pepper, message));
}

/**
 * Compare a presented secret to a stored HMAC hex digest.
 * Always computes the HMAC, including when the row is missing, so the compare itself
 * does not short-circuit on secret bytes.
 */
export async function secretMatches(pepper: string, secret: string, storedHex: string | null): Promise<boolean> {
  const computed = await hmacSha256(pepper, secret);
  const stored = storedHex ? hexToBytes(storedHex) : null;
  const candidate = stored && stored.length === computed.length ? stored : DUMMY_HASH;
  const equal = timingSafeEqual(computed, candidate);
  return stored !== null && stored.length === computed.length && equal;
}

export interface IssuedToken {
  id: string;
  token: string;
  prefix: string;
  secretHash: string;
}

/** 128-bit id + 256-bit secret. The id is the lookup key; the secret is hashed. */
export async function issueToken(kind: TokenKind, pepper: string): Promise<IssuedToken> {
  return issueTokenWithId(kind, pepper, randomUuid());
}

export async function issueTokenWithId(kind: TokenKind, pepper: string, id: string): Promise<IssuedToken> {
  const idBytes = uuidToBytes(id);
  if (!idBytes) throw new Error("uuid");
  const secret = bytesToBase64Url(randomBytes(32));
  const token = `${KIND_PREFIX[kind]}${bytesToBase64Url(idBytes)}_${secret}`;
  return {
    id,
    token,
    prefix: token.slice(0, KIND_PREFIX[kind].length + 6),
    secretHash: await hmacHex(pepper, secret),
  };
}

export function parseToken(value: string): ParsedToken | null {
  const match = TOKEN_RE.exec(value);
  if (!match) return null;
  const kind = match[1] as TokenKind;
  const idBytes = base64UrlToBytes(match[2] ?? "");
  const secret = match[3] ?? "";
  if (!idBytes) return null;
  const id = bytesToUuid(idBytes);
  if (!id) return null;
  return { kind, id, secret };
}

export function randomClientId(): string {
  return `wings_cli_${bytesToBase64Url(randomBytes(16))}`;
}

export async function pkceS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  const expected = base64UrlToBytes(await pkceS256(verifier));
  const given = base64UrlToBytes(challenge);
  if (!expected || !given) return false;
  return timingSafeEqual(expected, given);
}
