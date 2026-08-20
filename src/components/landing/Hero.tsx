import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "@/lib/icons";
import { motionEase } from "./constants";
import { HeroScreenshot } from "./HeroScreenshot";
import { AsciiWordmark } from "@/lib/ascii";

import { StripeDivider } from "./LinedShell";

interface Props { ctaHref: string }

export function Hero({ ctaHref }: Props) {
  return (
    <section>
      <div className="screen-line-top screen-line-bottom px-4 pt-12 sm:pt-16 md:pt-20 pb-12 sm:pb-16 text-center flex flex-col items-center gap-6 sm:gap-7">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: motionEase }}
        >
          <AsciiWordmark />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: motionEase }}
          className="font-display font-bold text-4xl sm:text-5xl md:text-7xl lg:text-[5.5rem] tracking-[-0.045em] leading-[0.92]"
        >
          write pages.<br />
          add <span className="text-accent-strong">math & drawings.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.2, ease: motionEase }}
          className="text-sm sm:text-base md:text-lg text-ink-1 font-sans max-w-xl mx-auto leading-relaxed px-2"
        >
          nested pages, slash commands, LaTeX, Excalidraw, and an AI panel with Ask / Plan / Agent. keep private pages in a folder on this device — or share a link when you want to write together.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: motionEase }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2 sm:pt-3 max-w-sm sm:max-w-none mx-auto"
        >
          <Link
            to={ctaHref}
            className="group relative z-10 inline-flex items-center justify-center gap-2 rounded-full bg-accent-strong text-accent-strong-foreground px-6 sm:px-7 py-3 sm:py-3.5 text-[11px] sm:text-xs font-mono uppercase tracking-[0.2em] hover:gap-3 transition-all overflow-hidden touch-manipulation active:scale-[0.98]"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-background/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            start writing <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            to="/pricing"
            className="relative z-10 inline-flex items-center justify-center gap-2 rounded-full border border-border-strong bg-surface-1/40 backdrop-blur px-6 sm:px-7 py-3 sm:py-3.5 text-[11px] sm:text-xs font-mono uppercase tracking-[0.2em] hover:bg-accent/40 transition-colors touch-manipulation active:scale-[0.98]"
          >
            see pricing
          </Link>
        </motion.div>
      </div>
      <StripeDivider />
      <div className="screen-line-bottom px-4 py-8 sm:py-10 md:py-12">
        <HeroScreenshot />
      </div>
    </section>
  );
}
