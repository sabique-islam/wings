import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "@/lib/icons";
import { useState } from "react";
import { motionEase } from "./constants";
import { NAV_LINKS } from "@/config/navigation";
import { Logo } from "@/components/Logo";
import { GitHubStarsBadge } from "@/components/landing/GitHubStarsBadge";

interface Props { ctaHref: string; ctaLabel: string }

export function NavBar({ ctaHref, ctaLabel }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: motionEase }}
      className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border-subtle"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="shrink-0">
          <Logo size={32} withWordmark wordmarkClassName="text-sm tracking-tight font-display font-semibold" />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-xs font-mono text-ink-2">
          {NAV_LINKS.map((l) => (
            <Link key={l.l} to={l.to} className="hover:text-foreground transition-colors">{l.l}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <GitHubStarsBadge className="hidden sm:inline-flex" />
          <Link
            to={ctaHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-strong text-accent-strong-foreground text-[10px] sm:text-[11px] font-mono uppercase tracking-widest px-3 sm:px-4 py-1.5 hover:scale-[1.03] transition-transform"
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-1.5 rounded border border-border-subtle"
            aria-label="menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur">
          <nav className="px-4 py-4 flex flex-col gap-3 text-sm font-mono">
            {NAV_LINKS.map((l) => (
              <Link key={l.l} to={l.to} onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">{l.l}</Link>
            ))}
            <GitHubStarsBadge className="mt-1" />
          </nav>
        </div>
      )}
    </motion.header>
  );
}
