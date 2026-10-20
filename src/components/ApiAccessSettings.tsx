import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AccessRequestError,
  createAccessToken,
  listAccessTokens,
  listConnectedApps,
  revokeAccessToken,
  revokeConnectedApp,
  type AccessTokenRow,
  type ConnectedApp,
} from "@/lib/accountAccess";

const inputCls =
  "w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ring font-mono";

function formatWhen(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

export function ApiAccessSettings() {
  const [tokens, setTokens] = useState<AccessTokenRow[]>([]);
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [days, setDays] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextTokens, nextApps] = await Promise.all([listAccessTokens(), listConnectedApps()]);
      setTokens(nextTokens);
      setApps(nextApps);
      setUnavailable(false);
    } catch (error) {
      if (error instanceof AccessRequestError && error.status === 503) {
        setUnavailable(true);
      } else {
        toast.error(error instanceof Error ? error.message : "Could not load access settings.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name the token first.");
      return;
    }
    let expiresAt: string | null = null;
    if (days.trim()) {
      const count = Number(days);
      if (!Number.isInteger(count) || count < 1 || count > 730) {
        toast.error("Expiry must be a whole number of days, up to 730.");
        return;
      }
      expiresAt = new Date(Date.now() + count * 24 * 60 * 60 * 1000).toISOString();
    }
    try {
      const created = await createAccessToken({ name: trimmed, write, expiresAt });
      setFreshToken(created.token ?? null);
      setName("");
      setWrite(false);
      setDays("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the token.");
    }
  };

  const revokeToken = async (id: string) => {
    try {
      await revokeAccessToken(id);
      if (freshToken) setFreshToken(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the token.");
    }
  };

  const revokeApp = async (id: string) => {
    try {
      await revokeConnectedApp(id);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the app.");
    }
  };

  const copyToken = async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      toast.success("Copied. Store it somewhere safe.");
    } catch {
      toast.error("Copy failed. Select the token and copy it yourself.");
    }
  };

  if (unavailable) {
    return (
      <p className="text-sm text-ink-1">
        Personal tokens and connected apps are not available until this server is configured.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-display font-semibold">personal access tokens</h3>
          <p className="text-xs text-ink-2 mt-1">
            For scripts and MCP clients that send <span className="font-mono">Authorization: Bearer</span>.
            New tokens can read your pages. Writing is off unless you turn it on. The secret is shown once.
          </p>
        </div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="token name"
          maxLength={80}
          className={inputCls}
        />
        <label className="flex items-center gap-2 text-xs font-mono text-ink-1">
          <input type="checkbox" checked={write} onChange={(event) => setWrite(event.target.checked)} />
          allow write (create, update, append)
        </label>
        <input
          value={days}
          onChange={(event) => setDays(event.target.value)}
          placeholder="expires in days (optional)"
          inputMode="numeric"
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => void create()}
          className="rounded bg-accent-strong text-accent-strong-foreground text-xs font-mono px-4 py-1.5 hover:bg-accent-strong-hover transition-colors"
        >
          create token
        </button>
        {freshToken && (
          <div className="space-y-2 rounded-lg border border-border-subtle p-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink-2">copy this now</p>
            <textarea readOnly value={freshToken} className={inputCls + " min-h-16"} />
            <button type="button" onClick={() => void copyToken()} className="text-[10px] font-mono text-ink-2 hover:text-foreground">
              copy
            </button>
          </div>
        )}
        {loading ? <p className="text-xs text-ink-2">loading…</p> : null}
        <ul className="space-y-2">
          {tokens.map((token) => (
            <li key={token.id} className="rounded-lg border border-border-subtle p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono truncate">{token.name}</span>
                <span className="ml-auto text-[10px] font-mono text-ink-2">{token.scopes.join(" ")}</span>
              </div>
              <p className="text-[10px] font-mono text-ink-2">
                {token.prefix}… · last used {formatWhen(token.last_used_at)} · expires {formatWhen(token.expires_at)}
              </p>
              <button
                type="button"
                onClick={() => void revokeToken(token.id)}
                className="text-[10px] font-mono text-ink-2 hover:text-destructive"
              >
                revoke
              </button>
            </li>
          ))}
          {!loading && tokens.length === 0 && <li className="text-xs text-ink-2">no active tokens</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-display font-semibold">connected apps</h3>
          <p className="text-xs text-ink-2 mt-1">
            Apps you approved with OAuth, such as ChatGPT or Claude. Revoking cuts off their access and refresh tokens.
          </p>
        </div>
        <ul className="space-y-2">
          {apps.map((app) => (
            <li key={app.id} className="rounded-lg border border-border-subtle p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono truncate">{app.client_name}</span>
                <span className="ml-auto text-[10px] font-mono text-ink-2">{app.scopes.join(" ")}</span>
              </div>
              <p className="text-[10px] font-mono text-ink-2">
                {(app.redirect_hosts ?? []).join(", ") || "no redirect host"} · last used {formatWhen(app.last_used_at)}
              </p>
              <button
                type="button"
                onClick={() => void revokeApp(app.id)}
                className="text-[10px] font-mono text-ink-2 hover:text-destructive"
              >
                revoke
              </button>
            </li>
          ))}
          {!loading && apps.length === 0 && <li className="text-xs text-ink-2">no connected apps</li>}
        </ul>
      </section>
    </div>
  );
}
