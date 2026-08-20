// Per-provider settings (selected provider, per-provider key, per-provider model).
// Everything lives in localStorage so the AI flow is fully BYOK.

import { getProvider, PROVIDERS } from "./providers";

const PROVIDER_KEY = "wings_ai_provider";
const apiKeyKey = (provider: string) => `wings_ai_key_${provider}`;
const modelKey = (provider: string) => `wings_ai_model_${provider}`;

// Legacy storage from the old Gemini-only client. Keeps existing users seamless.
const LEGACY_KEY = "nw_gemini_api_key";
const LEGACY_MODEL = "nw_gemini_model";

export function getActiveProvider(): string {
  const stored = localStorage.getItem(PROVIDER_KEY);
  if (stored === "lovable") {
    localStorage.setItem(PROVIDER_KEY, "google");
    return "google";
  }
  return stored || "google";
}
export function setActiveProvider(id: string): void {
  if (PROVIDERS.some((p) => p.id === id)) localStorage.setItem(PROVIDER_KEY, id);
}

export function getApiKeyFor(provider: string): string {
  const v = localStorage.getItem(apiKeyKey(provider));
  if (v) return v;
  if (provider === "google") return localStorage.getItem(LEGACY_KEY) || "";
  return "";
}
export function setApiKeyFor(provider: string, key: string): void {
  localStorage.setItem(apiKeyKey(provider), key.trim());
}
export function clearApiKeyFor(provider: string): void {
  localStorage.removeItem(apiKeyKey(provider));
  if (provider === "google") localStorage.removeItem(LEGACY_KEY);
}

function catalogIds(provider: string): Set<string> {
  return new Set((getProvider(provider)?.models || []).map((m) => m.id));
}

export function getModelFor(provider: string): string {
  const ids = catalogIds(provider);
  const stored = localStorage.getItem(modelKey(provider));
  if (stored && ids.has(stored)) return stored;
  if (provider === "google") {
    const legacy = localStorage.getItem(LEGACY_MODEL);
    if (legacy && ids.has(legacy)) return legacy;
  }
  return getProvider(provider)?.models[0]?.id || "";
}
export function setModelFor(provider: string, model: string): void {
  localStorage.setItem(modelKey(provider), model);
}

// Convenience helpers using the active provider.
export function getActiveApiKey(): string { return getApiKeyFor(getActiveProvider()); }
export function getActiveModel(): string { return getModelFor(getActiveProvider()); }
