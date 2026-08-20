import { motion } from "framer-motion";
import { motionEase } from "./constants";
import { LinedGrid, LinedHeading, linedCellClass, StripeDivider } from "./LinedShell";
import { FeatureGraphic } from "./FeatureGraphic";

type GraphicKind = "gyro" | "folder" | "tornado" | "smiley";

type ShowcaseFeature = {
  t: string;
  headline: string;
  d: string;
  tag: string;
  graphic: GraphicKind;
};

const SHOWCASE: ShowcaseFeature[] = [
  {
    t: "compose",
    headline: "block editor",
    d: "headings, lists, tasks, tables, code, callouts, toggles, and two- or three-column layouts. type / for slash commands or use markdown shortcuts.",
    tag: "/  →  table",
    graphic: "gyro",
  },
  {
    t: "keep",
    headline: "local vault",
    d: "connect a folder on this device. Always local pages keep the body as markdown on disk — Wings keeps the title in your account so the sidebar still works, not the body. share or collab and that page goes to the cloud. Chrome or Edge.",
    tag: "◉ on device",
    graphic: "folder",
  },
  {
    t: "summon",
    headline: "ask / plan / agent",
    d: "press ⌘J. Ask answers, Plan outlines, Agent writes. it sees the open page and can append, replace, or spin up a new one. keys stay in your browser — Google, OpenAI, Anthropic, Groq, xAI, Moonshot, MiniMax.",
    tag: "⌘J",
    graphic: "tornado",
  },
  {
    t: "publish",
    headline: "share & collab",
    d: "public read link at /s/…, or invite by email as viewer, editor, or admin. shared pages go live over Yjs so two people can type the same note. local vault pages stay private until you choose cloud.",
    tag: "↗ /s/",
    graphic: "smiley",
  },
];

type CompactFeature = { t: string; d: string; a: string };

const MORE: CompactFeature[] = [
  { t: "math & drawings", d: "inline $…$ or block $$…$$. insert an Excalidraw block or open the full canvas. scenes save with the page.", a: "Σ  +  ✎" },
  { t: "connected blocks", d: "databases, synced blocks, wiki links, page embeds, and web bookmarks. paste a URL for a preview; embed YouTube or Figma.", a: "[[]]" },
  { t: "versions", d: "open version history on a page and restore an earlier snapshot without leaving the editor.", a: "↺ history" },
  { t: "keyboard", d: "⌘K command palette, ⌘N new page, ⌘P quick switcher, ⌘B sidebar, ⌘/ sidebar search, / slash.", a: "⌘K" },
  { t: "drafts & export", d: "unsaved edits live in the browser. if the network drops, Wings retries the write. export markdown or JSON, download a zip of the vault layout, or import a Notion dump.", a: "↓  ↑" },
  { t: "columns & media", d: "two- or three-column layouts, floating images, callouts, toggles, and syntax-highlighted code.", a: "≡  ▦" },
];

export function FeatureGrid() {
  return (
    <section>
      <LinedHeading
        eyebrow="— features"
        title={<>what the app<br className="hidden sm:block" /> does today.</>}
      />
      <StripeDivider />

      <LinedGrid cols={2}>
        {SHOWCASE.map((f, i) => (
          <motion.article
            key={f.t}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: motionEase }}
            className={`${linedCellClass(2)} flex flex-col p-5 sm:p-6`}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <h3 className="font-display text-2xl sm:text-3xl tracking-tight capitalize">{f.t}</h3>
              <span className="font-display text-4xl sm:text-5xl font-bold text-transparent [-webkit-text-stroke:1px_hsl(var(--fg-3))] tabular-nums leading-none">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="relative mb-5 aspect-[16/9] min-h-[180px] w-full overflow-hidden bg-black contain-paint">
              <FeatureGraphic kind={f.graphic} />
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="font-display text-lg sm:text-xl font-semibold tracking-tight">{f.headline}</h4>
              <p className="text-sm text-ink-1 font-sans leading-relaxed">{f.d}</p>
            </div>
            <div className="mt-5 flex items-end justify-between gap-4">
              <span className="inline-flex items-center gap-2 text-[10px] font-mono text-ink-2 border border-line px-2 py-1">
                {f.tag}
              </span>
              <span className="text-[10px] font-mono text-ink-3 uppercase tracking-widest">wings</span>
            </div>
          </motion.article>
        ))}
      </LinedGrid>

      <StripeDivider />

      <LinedGrid cols={3}>
        {MORE.map((f, i) => (
          <motion.div
            key={f.t}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: i * 0.04, ease: motionEase }}
            className={`${linedCellClass(3)} p-5 sm:p-6`}
          >
            <div className="font-display text-lg tracking-tight mb-1.5">{f.t}</div>
            <p className="text-sm text-ink-1 font-sans leading-relaxed mb-4">{f.d}</p>
            <span className="text-[10px] font-mono text-ink-2 border border-line px-2 py-1">{f.a}</span>
          </motion.div>
        ))}
      </LinedGrid>
    </section>
  );
}
