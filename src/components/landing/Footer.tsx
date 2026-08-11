import { Link } from "react-router-dom";
import { Mail } from "@/lib/icons";
import { FOOTER_LINKS, SOCIAL } from "@/config/navigation";
import { Logo } from "@/components/Logo";
import { SITE } from "@/config/site";
import { FooterWordmark } from "@/components/landing/FooterWordmark";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-border-subtle bg-background pt-16 sm:pt-20 pb-0 px-4 sm:px-6 overflow-hidden">
      <div className="relative max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 sm:gap-10 mb-12 sm:mb-16">
          <div className="col-span-2 space-y-3">
            <Logo size={28} withWordmark wordmarkClassName="text-sm" />
            <p className="text-xs text-ink-2 font-mono leading-relaxed max-w-[18rem]">
              block editor for notes — markdown, LaTeX, Excalidraw, and AI. hosted on Supabase.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <a href={SOCIAL.discord} target="_blank" rel="noreferrer" aria-label="discord" className="w-8 h-8 grid place-items-center rounded border border-border-subtle hover:bg-accent/40 hover:border-border-strong transition-colors">
                <DiscordGlyph />
              </a>
              <a href={SOCIAL.email} aria-label="email" className="w-8 h-8 grid place-items-center rounded border border-border-subtle hover:bg-accent/40 hover:border-border-strong transition-colors"><Mail className="w-3.5 h-3.5" /></a>
            </div>
          </div>
          {FOOTER_LINKS.map((c) => (
            <div key={c.h} className="space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-2">{c.h}</div>
              <ul className="space-y-2">
                {c.links.map((l) => (
                  <li key={l.l}>
                    <Link to={l.to} className="text-xs font-mono text-ink-1 hover:text-foreground transition-colors">{l.l}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-8 border-t border-border-subtle">
          <div className="text-[10px] font-mono text-ink-2">© {year} {SITE.brand}</div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("wings:open-cookie-prefs"))}
              className="text-[10px] font-mono text-ink-2 hover:text-foreground transition-colors"
            >
              manage cookies
            </button>
            <Link to="/status" className="text-[10px] font-mono text-ink-2 hover:text-foreground transition-colors">{SITE.domain}</Link>
          </div>
        </div>

        <div className="mt-8 sm:mt-10 pt-8 border-t border-border-subtle" aria-hidden />
      </div>
      <FooterWordmark />
    </footer>
  );
}

function DiscordGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a14.6 14.6 0 0 0-.69 1.42 18.27 18.27 0 0 0-5.732 0A14.4 14.4 0 0 0 9.444 3a19.74 19.74 0 0 0-3.76 1.37C2.05 9.9 1.07 15.29 1.56 20.6a19.94 19.94 0 0 0 6.08 3.06c.49-.66.92-1.36 1.3-2.1-.71-.27-1.4-.6-2.05-.99.17-.13.34-.26.5-.4 4 1.87 8.32 1.87 12.27 0 .17.14.34.27.51.4-.65.39-1.34.72-2.06.99.38.74.81 1.44 1.3 2.1a19.9 19.9 0 0 0 6.08-3.06c.58-6.16-1-11.5-3.97-16.23ZM8.69 17.31c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm6.62 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"/>
    </svg>
  );
}
