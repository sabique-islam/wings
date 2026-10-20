import { supabase } from "@/integrations/supabase/client";

export class AccessRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AccessRequestError";
    this.status = status;
  }
}

export interface AccessTokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  token?: string;
}

export interface ConnectedApp {
  id: string;
  client_id: string;
  client_name: string;
  redirect_hosts: string[];
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
}

async function sessionFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const { data, error } = await supabase.auth.refreshSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new AccessRequestError(401, "Sign in again to manage access.");
  }
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("x-wings-session", "1");
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }
  if (!response.ok) {
    const message = response.status === 503
      ? "Access is not available until the server is configured."
      : "Request failed";
    throw new AccessRequestError(response.status, message);
  }
  return body;
}

export async function listAccessTokens(): Promise<AccessTokenRow[]> {
  const body = await sessionFetch("/api/v1/tokens") as { tokens?: AccessTokenRow[] };
  return body.tokens ?? [];
}

export async function createAccessToken(input: {
  name: string;
  write: boolean;
  expiresAt: string | null;
}): Promise<AccessTokenRow> {
  const payload: Record<string, unknown> = {
    name: input.name,
    scopes: input.write ? ["read", "write"] : ["read"],
  };
  if (input.expiresAt) payload.expires_at = input.expiresAt;
  return await sessionFetch("/api/v1/tokens", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as AccessTokenRow;
}

export async function revokeAccessToken(id: string): Promise<void> {
  await sessionFetch(`/api/v1/tokens/${id}/revoke`, { method: "POST", body: "{}" });
}

export async function listConnectedApps(): Promise<ConnectedApp[]> {
  const body = await sessionFetch("/api/v1/oauth/grants") as { grants?: ConnectedApp[] };
  return body.grants ?? [];
}

export async function revokeConnectedApp(id: string): Promise<void> {
  await sessionFetch(`/api/v1/oauth/grants/${id}/revoke`, { method: "POST", body: "{}" });
}

export async function submitOAuthDecision(body: Record<string, unknown>): Promise<{ redirect_to?: string }> {
  return await sessionFetch("/api/oauth/authorize", {
    method: "POST",
    body: JSON.stringify(body),
  }) as { redirect_to?: string };
}
