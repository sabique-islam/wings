import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { ArrowRight } from "@/lib/icons";
import { Ascii, SHOWCASE_BY_TAG } from "@/lib/ascii";

type CardData = {
  tag: string;
  title: string;
  body: string;
};

const CARDS: CardData[] = [
  {
    tag: "writing",
    title: "blocks you can move.",
    body: "each paragraph, heading, or embed is its own block. drag to reorder, nest sub-pages in the sidebar, pin favorites, and soft-delete to trash.",
  },
  {
    tag: "thinking",
    title: "ai with page context.",
    body: "the assistant panel reads the page you have open — not a blank chat. draft the next section, shorten a selection, or spin up a new page from a prompt. API keys stay in your browser.",
  },
  {
    tag: "sharing",
    title: "links and invites.",
    body: "turn on a public link so anyone can read. or invite a specific email as viewer, editor, or admin. roles are enforced per page.",
  },
];

/** Walk up the tree for a scroll parent (Lenis / overflow containers). */
function findScroller(el: HTMLElement): HTMLElement | undefined {
  let node = el.parentElement;
  while (node) {
    if (node.hasAttribute("data-lenis-prevent")) return node;
    const { overflowY, overflow } = getComputedStyle(node);
    const scrollableY = overflowY === "auto" || overflowY === "scroll";
    const scrollableBoth = overflow === "auto" || overflow === "scroll";
    if ((scrollableY || scrollableBoth) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return undefined;
}

type StackCardProps = CardData & {
  i: number;
  progress: MotionValue<number>;
  range: [number, number];
  targetScale: number;
};

function StackCard({ i, tag, title, body, progress, range, targetScale }: StackCardProps) {
  const scale = useTransform(progress, range, [1, targetScale]);

  return (
    <div
      className="sticky top-14 z-[var(--stack-z)] flex h-[calc(100svh-3.5rem)] items-center justify-center px-4 sm:px-6"
      style={{ "--stack-z": i + 1 } as React.CSSProperties}
    >
      <motion.div
        style={{
          scale,
          top: `calc(-5vh + ${i * 25}px)`,
        }}
        className="relative flex h-[min(500px,72vh)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface-1/95 shadow-4 backdrop-blur-xl [transform-origin:top]"
      >
        <div className="grid h-full grid-cols-1 md:grid-cols-2">
          <div className="flex flex-col justify-center p-7 sm:p-10 md:p-12 space-y-4 sm:space-y-5">
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent-strong">{tag}</div>
            <h2 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl tracking-tight leading-[1.05] m-0">
              {title}
            </h2>
            <p className="text-sm sm:text-base text-ink-1 font-sans leading-relaxed max-w-md m-0">{body}</p>
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-2 hover:text-foreground transition-colors w-fit"
            >
              try it <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="dither-viewbox relative flex min-h-[200px] md:min-h-0 items-center justify-center border-t md:border-t-0 md:border-l border-border-subtle p-4 sm:p-6 overflow-x-auto">
            <Ascii
              box
              size="text-[7px] xs:text-[8px] sm:text-[9px]"
              className="text-white/80 shrink-0"
            >
              {SHOWCASE_BY_TAG[tag]}
            </Ascii>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function CardStack({
  containerRef,
  scrollContainer,
}: {
  containerRef: RefObject<HTMLDivElement>;
  scrollContainer: HTMLElement | null;
}) {
  const scrollerRef = useRef<HTMLElement | null>(scrollContainer);
  scrollerRef.current = scrollContainer;

  const { scrollYProgress } = useScroll({
    ...(scrollContainer ? { container: scrollerRef as RefObject<HTMLElement> } : {}),
    target: containerRef,
    offset: ["start start", "end end"],
  });

  return (
    <>
      {CARDS.map((card, i) => {
        const targetScale = 1 - (CARDS.length - i) * 0.05;
        return (
          <StackCard
            key={card.tag}
            i={i}
            {...card}
            progress={scrollYProgress}
            range={[i * 0.25, 1]}
            targetScale={targetScale}
          />
        );
      })}
      <div className="h-[30vh]" aria-hidden />
    </>
  );
}

export function StackedScroll() {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null | undefined>(undefined);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    setScrollContainer(findScroller(rootRef.current) ?? null);
  }, []);

  const stackReady = scrollContainer !== undefined;

  return (
    <section ref={rootRef} className="relative">

      <div ref={containerRef}>
        {stackReady && (
          <CardStack containerRef={containerRef} scrollContainer={scrollContainer} />
        )}
      </div>
    </section>
  );
}
