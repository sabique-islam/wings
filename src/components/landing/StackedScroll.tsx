import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "@/lib/icons";
import { Ascii, SHOWCASE_BY_TAG } from "@/lib/ascii";
import { motionEase } from "./constants";
import { GraphicWell, LinedGrid, LinedHeading, linedSubgridCellClass, StripeDivider } from "./LinedShell";

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
    body: "the assistant panel reads the page you have open — not a blank chat. Ask, Plan, or Agent. draft the next section, shorten a selection, or spin up a new page. API keys stay in your browser.",
  },
  {
    tag: "keeping",
    title: "private on this device.",
    body: "connect a vault folder. Always local pages write markdown to disk — the body never hits Wings servers. titles stay in your account so the sidebar still works. sharing and collab need cloud.",
  },
  {
    tag: "sharing",
    title: "links and invites.",
    body: "turn on a public link so anyone can read. or invite a specific email as viewer, editor, or admin. shared pages sync live. roles are enforced per page.",
  },
];

export function StackedScroll() {
  return (
    <section>
      <LinedHeading
        eyebrow="— showcase"
        title={<>how it feels<br className="hidden sm:block" /> in the app.</>}
        subtitle="writing, thinking, keeping, and sharing — the same motions, now with the blocks that actually ship."
      />
      <StripeDivider />
      <LinedGrid cols={2}>
        {CARDS.map((card, i) => (
          <ShowcaseCell key={card.tag} card={card} i={i} />
        ))}
      </LinedGrid>
    </section>
  );
}

function ShowcaseCell({ card, i }: { card: CardData; i: number }) {
  return (
    <motion.article
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: i * 0.08, ease: motionEase }}
      className={linedSubgridCellClass(2, 2)}
    >
      <ShowcaseCopy card={card} />
      <ShowcaseArt tag={card.tag} />
    </motion.article>
  );
}

function ShowcaseCopy({ card }: { card: CardData }) {
  return (
    <div className="flex flex-col justify-center p-6 sm:p-8 space-y-3 sm:space-y-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent-strong">{card.tag}</div>
      <h3 className="font-display font-bold text-2xl sm:text-3xl tracking-tight leading-[1.05] m-0">
        {card.title}
      </h3>
      <p className="text-sm sm:text-base text-ink-1 font-sans leading-relaxed max-w-md m-0">{card.body}</p>
      <Link
        to="/auth"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-2 hover:text-foreground transition-colors w-fit"
      >
        try it <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function ShowcaseArt({ tag }: { tag: string }) {
  return (
    <div className="px-6 pb-6 sm:px-8 sm:pb-8">
      <GraphicWell className="dither-viewbox">
        <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
          <Ascii
            box
            size="text-[7px] xs:text-[8px] sm:text-[9px]"
            className="text-white/80 max-h-full max-w-full"
          >
            {SHOWCASE_BY_TAG[tag]}
          </Ascii>
        </div>
      </GraphicWell>
    </div>
  );
}
