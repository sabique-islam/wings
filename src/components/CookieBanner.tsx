import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, X } from "@/lib/icons";

const STORAGE_KEY = "wings:cookie-consent:v1";

export type CookieCategory = "essential" | "analytics" | "marketing";
export interface CookieConsent {
  decidedAt: number;
  essential: true;
  analytics: boolean;
  marketing: boolean;
}

const DEFAULT_CONSENT: CookieConsent = {
  decidedAt: 0,
  essential: true,
  analytics: true,
  marketing: false,
};

const REJECT_ALL: CookieConsent = {
  decidedAt: 0,
  essential: true,
  analytics: false,
  marketing: false,
};

export function getCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CookieConsent) : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(consent: CookieConsent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  // Real-time signal so any listener (analytics loaders, etc.) can react now.
  window.dispatchEvent(new CustomEvent("wings:cookie-consent", { detail: consent }));
}

export function clearCookieConsent() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("wings:cookie-consent", { detail: null }));
}

/** Analytics runs unless the user explicitly rejected it in the consent banner. */
export function isAnalyticsEnabled(): boolean {
  const consent = getCookieConsent();
  if (!consent) return true;
  return consent.analytics;
}

/**
 * Cookie consent banner. Analytics is on by default; marketing stays off until
 * the user opts in. Choices are stored locally and broadcast so loaders react.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [draft, setDraft] = useState<CookieConsent>({ ...DEFAULT_CONSENT });

  useEffect(() => {
    const existing = getCookieConsent();
    if (!existing) setOpen(true);
  }, []);

  useEffect(() => {
    const reopen = () => {
      const existing = getCookieConsent();
      setDraft(existing ?? { ...DEFAULT_CONSENT });
      setDetails(Boolean(existing));
      setOpen(true);
    };
    window.addEventListener("wings:open-cookie-prefs", reopen);
    return () => window.removeEventListener("wings:open-cookie-prefs", reopen);
  }, []);

  const decide = (consent: CookieConsent) => {
    setCookieConsent({ ...consent, decidedAt: Date.now(), essential: true });
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md z-[60]"
          role="dialog"
          aria-labelledby="cookie-title"
          aria-describedby="cookie-desc"
        >
          <div className="rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-4 sm:p-5 font-mono">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-accent/40 grid place-items-center shrink-0">
                <Cookie className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div id="cookie-title" className="text-[11px] uppercase tracking-widest text-muted-foreground">cookies</div>
                <p id="cookie-desc" className="text-xs text-foreground/85 mt-1 leading-relaxed">
                  Wings uses a single essential session cookie to keep you signed in. Anonymous analytics are on by default; marketing cookies stay off unless you opt in.
                  Read the <Link to="/legal/cookies" className="underline hover:text-foreground">cookie policy</Link>.
                </p>
              </div>
              <button
                onClick={() => decide({ ...DEFAULT_CONSENT })}
                aria-label="dismiss"
                className="p-1 text-muted-foreground hover:text-foreground"
              ><X className="w-3.5 h-3.5" /></button>
            </div>

            {details && (
              <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                <CookieRow
                  k="essential" label="essential" desc="auth + session. required."
                  checked disabled
                />
                <CookieRow
                  k="analytics" label="analytics" desc="anonymous usage stats. on by default."
                  checked={draft.analytics}
                  onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
                />
                <CookieRow
                  k="marketing" label="marketing" desc="cross-site ads. off by default."
                  checked={draft.marketing}
                  onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => decide({ ...DEFAULT_CONSENT, marketing: true } as CookieConsent)}
                className="flex-1 min-w-[7rem] bg-foreground text-background text-[11px] uppercase tracking-widest rounded-md px-3 py-2 hover:opacity-90 transition-opacity"
              >accept all</button>
              <button
                onClick={() => decide({ ...REJECT_ALL })}
                className="flex-1 min-w-[7rem] border border-border text-[11px] uppercase tracking-widest rounded-md px-3 py-2 hover:bg-accent/40 transition-colors"
              >reject all</button>
              {details ? (
                <button
                  onClick={() => decide({ ...draft, decidedAt: Date.now(), essential: true })}
                  className="basis-full border border-border text-[11px] uppercase tracking-widest rounded-md px-3 py-2 hover:bg-accent/40 transition-colors"
                >save choices</button>
              ) : (
                <button
                  onClick={() => setDetails(true)}
                  className="basis-full text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mt-1"
                >customize →</button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CookieRow({ k, label, desc, checked, onChange, disabled }: {
  k: CookieCategory; label: string; desc: string;
  checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label htmlFor={`ck-${k}`} className={`flex items-start gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input
        id={`ck-${k}`}
        type="checkbox"
        className="mt-1 accent-foreground"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <div className="flex-1">
        <div className="text-xs">{label}</div>
        <div className="text-[10px] text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}
