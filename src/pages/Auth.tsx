import { useEffect, useState } from "react";
import { Seo } from "@/components/Seo";
import { toast } from "sonner";
import { sendMagicLink, signInWithPassword } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/auth/oauth";
import { Logo } from "@/components/Logo";
import { GoogleLogo } from "@/components/GoogleLogo";
import { Dither } from "@/components/ui/Dither";
import { Link, useSearchParams } from "react-router-dom";
import { useRedirectIfAuthed } from "@/hooks/useRedirectIfAuthed";
import { isSafeReturnTo, stashReturnTo } from "@/lib/auth/returnTo";
import { LoadingScreen } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";

type Stage = "request" | "sent";
type Method = "link" | "password";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("request");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const { loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  // ?method=password opens the password form directly (used in reviewer instructions).
  const [method, setMethod] = useState<Method>(
    searchParams.get("method") === "password" ? "password" : "link",
  );
  useRedirectIfAuthed();

  useEffect(() => {
    const returnTo = searchParams.get("returnTo");
    if (returnTo && isSafeReturnTo(returnTo)) stashReturnTo(returnTo);
  }, [searchParams]);

  if (authLoading) {
    return <LoadingScreen variant="helix" />;
  }

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await sendMagicLink(email);
    setLoading(false);
    if (error) return toast.error(error.message);
    setStage("sent");
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    const { error } = await signInWithPassword(email, password);
    setLoading(false);
    setPassword("");
    // On success the auth listener sets the session and useRedirectIfAuthed
    // continues to returnTo (for example the OAuth consent screen).
    if (error) toast.error(error.message);
  };

  const handleGoogle = async () => {
    setOauthLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setOauthLoading(false);
      toast.error(result.error.message);
    }
  };

  return (
    <>
      <Seo title="sign in" path="/auth" noIndex />
      <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
        <Dither variant="grain" fade="radial" density="sparse" className="opacity-100" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42vh]" aria-hidden>
          <Dither variant="bayer" fade="up" density="sparse" accent className="opacity-60" />
        </div>

        <Link
          to="/"
          className="absolute top-6 left-6 z-10 text-ink-2 hover:text-foreground transition-colors"
        >
          <Logo size={24} withWordmark wordmarkClassName="text-xs font-display font-medium" />
        </Link>

        <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-20">
          <div className="w-full max-w-[340px] space-y-10">
            <div className="space-y-2 text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight">sign in</h1>
              <p className="text-sm text-ink-2">your pages, math, and drawings — in one place.</p>
            </div>

            {stage === "sent" ? (
              <div className="space-y-5 text-center">
                <div className="relative mx-auto h-px w-24 overflow-hidden rounded-full bg-border-subtle">
                  <div className="dither dither--bayer dither--accent absolute inset-0 opacity-80" />
                </div>
                <p className="text-sm text-ink-1">
                  check <span className="text-foreground font-medium">{email}</span> for your link
                </p>
                <button
                  type="button"
                  onClick={() => setStage("request")}
                  className="text-xs text-ink-2 hover:text-foreground transition-colors underline underline-offset-4"
                >
                  use a different email
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={oauthLoading}
                  className="w-full inline-flex items-center justify-center gap-3 rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 text-sm font-medium hover:bg-surface-2 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <GoogleLogo size={20} />
                  {oauthLoading ? "redirecting…" : "Continue with Google"}
                </button>

                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-border-subtle" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-ink-3 font-mono">or</span>
                  <span className="h-px flex-1 bg-border-subtle" />
                </div>

                {method === "password" ? (
                <form onSubmit={handlePassword} className="space-y-3">
                  <label className="sr-only" htmlFor="auth-password-email">email</label>
                  <input
                    id="auth-password-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="username"
                    className="w-full rounded-lg border border-border-subtle bg-background/80 px-4 py-3 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ring backdrop-blur-sm"
                    required
                  />
                  <label className="sr-only" htmlFor="auth-password">password</label>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-border-subtle bg-background/80 px-4 py-3 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ring backdrop-blur-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-accent-strong px-4 py-3 text-sm font-medium text-accent-strong-foreground hover:bg-accent-strong-hover transition-colors disabled:opacity-50"
                  >
                    {loading ? "signing in…" : "sign in with password"}
                  </button>
                </form>
                ) : (
                <form onSubmit={handleRequest} className="space-y-3">
                  <label className="sr-only" htmlFor="auth-email">email</label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    autoComplete="email"
                    className="w-full rounded-lg border border-border-subtle bg-background/80 px-4 py-3 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ring backdrop-blur-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-accent-strong px-4 py-3 text-sm font-medium text-accent-strong-foreground hover:bg-accent-strong-hover transition-colors disabled:opacity-50"
                  >
                    {loading ? "sending…" : "email me a magic link"}
                  </button>
                </form>
                )}
              </div>
            )}

            <div className="space-y-2 text-center text-[11px] text-ink-3 leading-relaxed">
              <p>no password needed · magic link or Google</p>
              {stage === "request" && (
                <button
                  type="button"
                  onClick={() => setMethod(method === "password" ? "link" : "password")}
                  className="underline underline-offset-4 hover:text-foreground transition-colors"
                >
                  {method === "password" ? "use a magic link instead" : "have a password? sign in with it"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
