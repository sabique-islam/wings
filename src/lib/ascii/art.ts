// Single source of truth for Wings' ASCII art.

export const WINGS_WORDMARK = `
 ██╗    ██╗██╗███╗   ██╗ ██████╗ ███████╗
 ██║    ██║██║████╗  ██║██╔════╝ ██╔════╝
 ██║ █╗ ██║██║██╔██╗ ██║██║  ███╗███████╗
 ██║███╗██║██║██║╚██╗██║██║   ██║╚════██║
 ╚███╔███╔╝██║██║ ╚████║╚██████╔╝███████║
  ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝
`;

export const WINGS_TAGLINE = "notes, math, drawings, and ai";

export const WINGS_MARK_COMPACT = `┌──────────────────────┐
│  ◼  wings · write    │
│  /think  >  render   │
└──────────────────────┘`;

export const SPINNER_FRAMES = [
  `   __        __
   \\ \\      / /
    \\ \\ /\\ / / 
     \\ V  V /  
      \\_/\\_/   `,
  `   __        __ .
   \\ \\      / / ..
    \\ \\ /\\ / / ...
     \\ V  V /  ....
      \\_/\\_/   .....`,
  `   __        __  ·
   \\ \\      / / ··
    \\ \\ /\\ / / ···
     \\ V  V /  ····
      \\_/\\_/   ·····`,
];

export const EMPTY_BOX = `    ┌──────────┐
    │  ◇  ◇  ◇ │
    │  write   │
    │  freely  │
    └──────────┘`;

const BOX_INNER = 36;

function padAscii(line: string, width: number): string {
  return line.length >= width ? line.slice(0, width) : line + " ".repeat(width - line.length);
}

/** Build a fixed-width box — every line is exactly BOX_INNER + 2 chars. */
export function asciiBox(title: string, rows: string[]): string {
  const label = ` ${title} `;
  const dashes = Math.max(0, BOX_INNER - label.length);
  const top = `┌${label}${"─".repeat(dashes)}┐`;
  const body = rows.map((row) => `│${padAscii(row, BOX_INNER)}│`);
  const bottom = `└${"─".repeat(BOX_INNER)}┘`;
  return [top, ...body, bottom].join("\n");
}

/** Showcase sticky-scroll panels — ASCII-only, programmatically aligned. */
export const SHOWCASE_WRITING = asciiBox("workspace", [
  "> inbox",
  "  - daily notes              [*]",
  "",
  "| blocks, not boxes.",
  "",
  "  /table   $latex$   ~ sketch",
  "",
  "drag . nest . transform",
]);

export const SHOWCASE_THINKING = asciiBox("agent ^J", [
  "",
  "  reading open page...",
  "  | draft next paragraph_",
  "",
  "  ##||||##  context stream",
  "",
  "  ask . refactor . inline",
]);

export const SHOWCASE_KEEPING = asciiBox("vault", [
  "",
  "  [*] this device   [ ] cloud",
  "  --------------------------------",
  "  ~/notes/daily.md",
  "                    ^ on disk",
  "",
  "  body stays . title syncs",
]);

export const SHOWCASE_SHARING = asciiBox("publish", [
  "",
  "  (*) private    ( ) link",
  "  --------------------------------",
  "  wings.nopejs.me/s/daily",
  "                    ^ live",
  "",
  "  viewer . editor . admin",
]);

export const SHOWCASE_BY_TAG: Record<string, string> = {
  writing: SHOWCASE_WRITING,
  thinking: SHOWCASE_THINKING,
  keeping: SHOWCASE_KEEPING,
  sharing: SHOWCASE_SHARING,
};

// Block-fill ramp for ASCII sparklines / meters.
export const BLOCK_RAMP = " ▁▂▃▄▅▆▇█";
export const METER_FILL = "█";
export const METER_EMPTY = "░";

/** Map a number series onto vertical block characters (▁▂▃▄▅▆▇█). */
export function toBlocks(data: number[]): string {
  const max = Math.max(1, ...data);
  const ramp = "▁▂▃▄▅▆▇█";
  return data
    .map((v) => ramp[Math.min(ramp.length - 1, Math.max(0, Math.round((v / max) * (ramp.length - 1))))])
    .join("");
}

/** Render a fixed-width ASCII meter, e.g. ████████░░░░. */
export function toMeter(value: number, width = 12): string {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * width);
  return METER_FILL.repeat(filled) + METER_EMPTY.repeat(Math.max(0, width - filled));
}
