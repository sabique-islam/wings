import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function InfiniteMarquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const row = [...items, ...items];
  const [accentIdx, setAccentIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAccentIdx((i) => (i + 1) % items.length), 1800);
    return () => clearInterval(t);
  }, [items.length]);

  return (
    <div className="screen-line-top screen-line-bottom relative overflow-hidden py-4 sm:py-5">
      <div
        className={cn(
          "flex w-max gap-8 sm:gap-12 whitespace-nowrap",
          reverse ? "animate-wings-marquee-reverse" : "animate-wings-marquee",
        )}
      >
        {row.map((t, i) => {
          const isAccent = i % items.length === accentIdx;
          return (
            <span
              key={i}
              className={cn(
                "flex items-center gap-8 sm:gap-12 text-xl sm:text-2xl md:text-4xl font-mono uppercase tracking-tight transition-colors duration-500",
                isAccent ? "text-accent-strong" : "text-ink-2/60",
              )}
            >
              {t} <span className="text-ink-3">·</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
