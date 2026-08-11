import { useEffect, useState } from "react";
import { Github, Star } from "@/lib/icons";
import { SITE } from "@/config/site";
import { cn } from "@/lib/utils";

const REPO = SITE.social.githubRepo.replace("https://github.com/", "");
const CACHE_KEY = `nw:github-stars:${REPO}`;
const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry = { stars: number; at: number };

function readCachedStars(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { stars, at } = JSON.parse(raw) as CacheEntry;
    if (typeof stars !== "number" || Date.now() - at > CACHE_TTL_MS) return null;
    return stars;
  } catch {
    return null;
  }
}

function writeCachedStars(stars: number): void {
  try {
    const entry: CacheEntry = { stars, at: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // quota / private mode
  }
}

function formatStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString();
}

export function GitHubStarsBadge({ className }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(() => readCachedStars());

  useEffect(() => {
    if (readCachedStars() != null) return;

    let cancelled = false;
    fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stargazers_count?: number } | null) => {
        if (cancelled || typeof data?.stargazers_count !== "number") return;
        writeCachedStars(data.stargazers_count);
        setStars(data.stargazers_count);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      href={SITE.social.githubRepo}
      target="_blank"
      rel="noreferrer"
      aria-label={stars != null ? `${stars} GitHub stars — open repository` : "GitHub repository"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1/80 px-2.5 py-1.5",
        "text-[10px] font-mono text-ink-1 hover:text-foreground hover:bg-surface-2 transition-colors",
        className,
      )}
    >
      <Github className="size-3.5 shrink-0" aria-hidden />
      <Star className="size-3.5 shrink-0 -translate-y-px fill-current opacity-70" aria-hidden />
      <span className="tabular-nums leading-none">{stars != null ? formatStars(stars) : "…"}</span>
    </a>
  );
}
