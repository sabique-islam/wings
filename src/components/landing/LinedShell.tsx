import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type LinedWidth = "5xl" | "6xl";
type LinedCols = 2 | 3;

interface LinedShellProps {
  children: ReactNode;
  className?: string;
  width?: LinedWidth;
}

const widthClass: Record<LinedWidth, string> = {
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

/** Vertical rails + overflow clip so screen-lines span the viewport without scroll. */
export function LinedShell({ children, className, width = "6xl" }: LinedShellProps) {
  return (
    <div className={cn("w-full overflow-x-clip", className)}>
      <div className={cn("mx-auto px-4", widthClass[width])}>
        <div className="border-x border-line">{children}</div>
      </div>
    </div>
  );
}

interface LinedHeadingProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function LinedHeading({ eyebrow, title, subtitle, className }: LinedHeadingProps) {
  return (
    <div className={cn("screen-line-top screen-line-bottom", className)}>
      {eyebrow && (
        <div className="px-4 pt-8 text-[11px] font-mono uppercase tracking-[0.3em] text-ink-2">
          {eyebrow}
        </div>
      )}
      <h2 className="px-4 pt-2 pb-4 font-display font-bold text-3xl sm:text-4xl md:text-5xl tracking-tight leading-[1.05]">
        {title}
      </h2>
      {subtitle && (
        <p className="px-4 pb-6 text-sm sm:text-base text-ink-1 font-sans leading-relaxed max-w-2xl">
          {subtitle}
        </p>
      )}
    </div>
  );
}

interface LinedGridProps {
  children: ReactNode;
  cols?: LinedCols;
  className?: string;
}

/** Ghost column borders + matching content grid. Cells share hairlines, not card chrome. */
export function LinedGrid({ children, cols = 3, className }: LinedGridProps) {
  return (
    <div className={cn("screen-line-top relative", className)}>
      {cols === 2 ? (
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden sm:grid sm:grid-cols-2 gap-4"
          aria-hidden
        >
          <div className="border-r border-line" />
          <div className="border-l border-line" />
        </div>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden sm:grid sm:grid-cols-2 md:grid-cols-3 gap-4"
          aria-hidden
        >
          <div className="border-r border-line" />
          <div className="border-l border-line md:border-x" />
          <div className="hidden md:block border-l border-line" />
        </div>
      )}
      <div
        className={cn(
          "relative grid grid-cols-1",
          cols === 2 ? "sm:grid-cols-2 gap-4" : "sm:grid-cols-2 md:grid-cols-3 gap-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function linedCellClass(cols: LinedCols = 3) {
  return cn(
    "screen-line-bottom",
    cols === 2 && "max-sm:screen-line-top",
    cols === 3 && "max-sm:screen-line-top",
  );
}

/** Full-viewport hatch; L-brackets sit on the inner content rails. */
export function StripeDivider({ className }: { className?: string }) {
  return (
    <div className={cn("stripe-divider", className)} aria-hidden>
      <div className="stripe-divider-bleed">
        <span className="stripe-divider-fill" />
      </div>
      <span className="stripe-divider-rule stripe-divider-rule--top" />
      <span className="stripe-divider-rule stripe-divider-rule--bottom" />
      <span className="stripe-divider-corner stripe-divider-corner--tl" />
      <span className="stripe-divider-corner stripe-divider-corner--tr" />
      <span className="stripe-divider-corner stripe-divider-corner--bl" />
      <span className="stripe-divider-corner stripe-divider-corner--br" />
    </div>
  );
}
