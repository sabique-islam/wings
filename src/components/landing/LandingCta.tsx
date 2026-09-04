import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "@/lib/icons";
import { motionEase } from "./constants";
import { AuroraBars } from "./AuroraBars";

interface Props {
  ctaHref?: string;
}

export function LandingCta({ ctaHref = "/auth" }: Props) {
  return (
    <section className="relative isolate screen-line-top screen-line-bottom px-4 py-16 sm:py-24 text-center space-y-6">
      <AuroraBars />
      <div className="relative z-10 space-y-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: motionEase }}
          className="font-display font-bold text-3xl sm:text-4xl md:text-6xl tracking-tight leading-tight"
        >
          try it — it's free.
        </motion.h2>
        <p className="text-sm sm:text-base text-ink-1 font-sans max-w-md mx-auto leading-relaxed">
          private pages can stay in a folder on this device. cloud is opt-in when you share.
        </p>
        <Link
          to={ctaHref}
          className="inline-flex items-center gap-2 rounded-full bg-accent-strong text-accent-strong-foreground px-7 sm:px-8 py-3.5 sm:py-4 text-[11px] sm:text-xs font-mono uppercase tracking-[0.2em] hover:scale-[1.03] transition-transform"
        >
          open the app <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}
