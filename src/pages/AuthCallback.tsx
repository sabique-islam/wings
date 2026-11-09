import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardPath } from "@/lib/auth/redirect";
import { takeReturnTo } from "@/lib/auth/returnTo";
import { WingsLoader } from "@/components/ui/spinner";
import { Seo } from "@/components/Seo";
import { Dither } from "@/components/ui/Dither";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const errorDescription = params.get("error_description") ?? params.get("error");

      if (errorDescription) {
        if (!cancelled) {
          setError(errorDescription);
          setTimeout(() => navigate("/auth", { replace: true }), 2500);
        }
        return;
      }

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        // Scrub the auth code / implicit token hash from the URL + history so it
        // never lands in bookmarks, referrers, or shared links.
        if (window.location.search || window.location.hash) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // PKCE code exchange, or implicit tokens in the URL hash (detectSessionInUrl).
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) throw new Error("Sign-in did not complete. Request a new magic link.");

        const returnTo = takeReturnTo();
        const path = returnTo ?? await getDashboardPath(session.user.id);
        if (!cancelled) navigate(path, { replace: true });
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setTimeout(() => navigate("/auth", { replace: true }), 2500);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <>
      <Seo title="signing in" path="/auth/callback" noIndex />
      <div className="relative flex flex-col items-center justify-center h-screen bg-background gap-3 px-6 text-center overflow-hidden">
        <Dither variant="grain" fade="radial" density="sparse" className="opacity-100" />
        <div className="relative z-10 flex flex-col items-center gap-3">
        {error ? (
          <>
            <p className="text-sm text-destructive font-mono">{error}</p>
            <p className="text-xs text-ink-2">redirecting to sign in…</p>
          </>
        ) : (
          <>
            <WingsLoader variant="helix" />
            <p className="text-xs text-ink-2 font-mono">finishing sign-in…</p>
          </>
        )}
        </div>
      </div>
    </>
  );
}
