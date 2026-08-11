import { motion } from "framer-motion";
import { Check, ArrowRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { PricingTier } from "@/config/pricing";

const ease = [0.22, 1, 0.36, 1] as const;

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
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, delay: index * 0.1, ease }}
      className={cn(
        "relative rounded-2xl border bg-surface-1 overflow-hidden flex flex-col",
        tier.accent
          ? "border-accent-strong/40 lg:-translate-y-3 shadow-4 ring-1 ring-accent-strong/20"
          : "border-border-subtle",
      )}
    >
      <div
        className={cn(
          "relative px-6 sm:px-7 pt-7 pb-6",
          tier.accent
            ? "bg-accent-strong text-accent-strong-foreground"
            : "border-b border-border-subtle",
        )}
      >
        <div className="relative z-10 space-y-2">
          <div className="flex items-center justify-between">
            <div className={cn("text-xs font-mono uppercase tracking-[0.3em]", tier.accent ? "opacity-90" : "text-ink-2")}>{tier.name}</div>
            {tier.accent && (
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent-strong-foreground text-accent-strong">planned</span>
            )}
          </div>
          <div className="text-xl font-display tracking-tight">{tier.tagline}</div>
          <div className="flex items-baseline gap-1 pt-3">
            <span className="text-4xl sm:text-5xl font-display font-bold tracking-tight tabular-nums">{tier.price}</span>
            <span className={cn("text-xs font-mono", tier.accent ? "opacity-70" : "text-ink-2")}>{tier.cadence}</span>
          </div>
        </div>
      </div>
      <div className="p-6 sm:p-7 flex-1 flex flex-col">
        <ul className="space-y-3 flex-1">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm font-sans">
              <Check className={cn("w-4 h-4 mt-0.5 flex-shrink-0", tier.accent ? "text-accent-strong" : "text-ink-1")} />
              <span className="text-ink-0">{f}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={() => onSelect(tier)}
          disabled={disabled}
          className={cn(
            "mt-7 sm:mt-8 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[11px] font-mono uppercase tracking-[0.2em] transition-all hover:gap-3 disabled:opacity-60 disabled:hover:gap-2",
            tier.accent
              ? "bg-accent-strong text-accent-strong-foreground hover:bg-accent-strong-hover"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {busy ? "loading…" : checkoutReady ? tier.cta : "coming soon"}
          {checkoutReady && <ArrowRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </motion.div>
  );
}
