import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { submitOAuthDecision } from "@/lib/accountAccess";

interface Preview {
  client_name: string;
  redirect_host: string;
  scopes: string[];
  resource: string;
}

function redirectAllowed(registered: string, target: string): boolean {
  try {
    const base = new URL(registered);
    const next = new URL(target);
    if (base.origin !== next.origin || base.pathname !== next.pathname) return false;
    for (const [key, value] of base.searchParams) {
      if (next.searchParams.get(key) !== value) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [write, setWrite] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/oauth/authorize/preview?${params.toString()}`);
      const body = await response.json().catch(() => null);
      if (cancelled) return;
      if (!response.ok || !body || typeof body.client_name !== "string") {
        setError("This connection request is not valid.");
        return;
      }
      const scopes = Array.isArray(body.scopes) ? body.scopes.filter((scope) => scope === "read" || scope === "write") : [];
      setPreview({
        client_name: body.client_name,
        redirect_host: typeof body.redirect_host === "string" ? body.redirect_host : "",
        scopes,
        resource: typeof body.resource === "string" ? body.resource : "",
      });
      setWrite(scopes.includes("write"));
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  const decide = async (decision: "allow" | "deny") => {
    const registered = params.get("redirect_uri");
    if (!registered) {
      setError("This connection request is not valid.");
      return;
    }
    const scopes = ["read"];
    if (decision === "allow" && write && preview?.scopes.includes("write")) scopes.push("write");
    setBusy(true);
    try {
      const result = await submitOAuthDecision({
        decision,
        client_id: params.get("client_id"),
        redirect_uri: registered,
        code_challenge: params.get("code_challenge"),
        code_challenge_method: params.get("code_challenge_method"),
        scope: params.get("scope"),
        state: params.get("state"),
        resource: params.get("resource"),
        scopes,
      });
      const target = result.redirect_to;
      if (typeof target === "string" && redirectAllowed(registered, target)) {
        window.location.assign(target);
        return;
      }
      setError("The app's redirect was rejected.");
    } catch {
      setError("Could not finish the connection.");
    } finally {
      setBusy(false);
    }
  };

  const writeRequested = preview?.scopes.includes("write") ?? false;

  return (
    <>
      <Seo title="connect an app" path="/oauth/authorize" noIndex />
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-6 border border-border-subtle rounded-xl bg-surface-1 p-6">
          <div className="space-y-2">
            <h1 className="font-display text-xl font-semibold">connect an app</h1>
            <p className="text-sm text-ink-2">
              This app is asking to use the Wings MCP endpoint for your account.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {preview && !error && (
            <div className="space-y-4 text-sm">
              <p><span className="text-ink-2">app</span> · <span className="font-mono">{preview.client_name}</span></p>
              <p><span className="text-ink-2">returns to</span> · <span className="font-mono">{preview.redirect_host}</span></p>
              <p><span className="text-ink-2">resource</span> · <span className="font-mono break-all">{preview.resource}</span></p>
              <label className="flex items-center gap-2 text-xs font-mono text-ink-1">
                <input type="checkbox" checked disabled />
                read your pages
              </label>
              {writeRequested && (
                <label className="flex items-center gap-2 text-xs font-mono text-ink-1">
                  <input type="checkbox" checked={write} onChange={(event) => setWrite(event.target.checked)} />
                  create and edit page bodies
                </label>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("allow")}
                  className="rounded bg-accent-strong text-accent-strong-foreground text-xs font-mono px-4 py-1.5 disabled:opacity-50"
                >
                  allow
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("deny")}
                  className="rounded border border-border-subtle text-xs font-mono px-4 py-1.5 text-ink-1"
                >
                  deny
                </button>
              </div>
            </div>
          )}
          {!preview && !error && <p className="text-xs font-mono text-ink-2">checking the request…</p>}
        </div>
      </div>
    </>
  );
}
