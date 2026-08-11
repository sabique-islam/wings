import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "@/lib/icons";
import { motionEase } from "./constants";

interface Props {
  ctaHref?: string;
}

export function LandingCta({ ctaHref = "/auth" }: Props) {
  return (
    <section className="relative py-24 sm:py-32 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto text-center space-y-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: motionEase }}
          className="font-display font-bold text-3xl sm:text-4xl md:text-6xl tracking-tight leading-tight"
        >
          try it — it's free.
        </motion.h2>
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
