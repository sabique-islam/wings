import { motion } from "framer-motion";
import { ArrowRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { PricingTier } from "@/config/pricing";
import { motionEase } from "@/components/landing/constants";
import { linedCellClass } from "@/components/landing/LinedShell";

interface Props {
  tier: PricingTier;
  index: number;
  onSelect: (tier: PricingTier) => void;
  busy?: boolean;
}

export function PricingCard({ tier, index, onSelect, busy }: Props) {
  const checkoutReady = tier.id === "free" || Boolean(tier.productId);
  const disabled = busy || !checkoutReady;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: motionEase }}
      className={`${linedCellClass(3)} group flex flex-col p-5 sm:p-6 transition-colors hover:bg-accent/20`}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <h3 className="font-display text-2xl sm:text-3xl tracking-tight">{tier.name}</h3>
        <span className="font-display text-4xl sm:text-5xl font-bold text-transparent [-webkit-text-stroke:1px_hsl(var(--fg-3))] tabular-nums leading-none">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 mb-2">
        <span
          className={cn(
            "text-4xl sm:text-5xl font-display font-bold tracking-tight tabular-nums",
            tier.accent && "text-accent-strong",
          )}
        >
          {tier.price}
        </span>
        {tier.cadence ? (
          <span className="text-xs font-mono text-ink-2">{tier.cadence}</span>
        ) : null}
      </div>
      <p className="text-sm text-ink-1 font-sans leading-relaxed mb-5">{tier.tagline}</p>

      <ul className="flex-1 space-y-2.5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm font-sans text-ink-0 leading-relaxed">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-2" aria-hidden />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-end justify-between gap-4">
        <button
          type="button"
          onClick={() => onSelect(tier)}
          disabled={disabled}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-mono uppercase tracking-[0.2em] transition-all hover:gap-3 disabled:opacity-60 disabled:hover:gap-2 disabled:cursor-not-allowed",
            checkoutReady
              ? "bg-accent-strong text-accent-strong-foreground"
              : "border border-border-strong bg-surface-1/40",
          )}
        >
          {busy ? "loading…" : checkoutReady ? tier.cta : "coming soon"}
          {checkoutReady && !busy ? <ArrowRight className="w-3.5 h-3.5" /> : null}
        </button>
        <span className="inline-flex items-center text-[10px] font-mono text-ink-2 border border-line px-2 py-1">
          {tier.id === "free" ? "today" : "planned"}
        </span>
      </div>
    </motion.article>
  );
}
