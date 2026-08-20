export const PRICING_TIERS = [
  {
    id: "free",
    name: "free",
    price: "$0",
    cadence: "",
    tagline: "everything available today.",
    features: [
      "unlimited pages & nesting",
      "block editor + slash commands",
      "LaTeX math & Excalidraw",
      "AI panel (your API key)",
      "local vault folder (page bodies on this device)",
      "share by link or email invite",
      "markdown + JSON export",
    ],
    cta: "start writing",
    accent: false,
    productId: "" as string,
  },
  {
    id: "explorer",
    name: "explorer",
    price: "$8",
    cadence: "/month · planned",
    tagline: "not available yet.",
    features: [
      "hosted AI credits",
      "higher storage limits",
      "priority email support",
    ],
    cta: "coming soon",
    accent: false,
    productId: "" as string,
  },
  {
    id: "scholar",
    name: "scholar",
    price: "$24",
    cadence: "/month · planned",
    tagline: "not available yet.",
    features: [
      "everything in explorer",
      "team workspaces",
      "version history",
      "early access to new blocks",
    ],
    cta: "coming soon",
    accent: true,
    productId: "" as string,
  },
] as const;

export type PricingTier = (typeof PRICING_TIERS)[number];

/** Features that ship in the app today — all on the free tier. */
export const INCLUDED_TODAY = [
  "nested pages with sidebar search",
  "block editor — headings, lists, tasks, tables, code, callouts",
  "LaTeX math ($…$ and $$…$$)",
  "Excalidraw drawings inline or in a modal",
  "AI panel with your own provider key (⌘J)",
  "local vault folder — page bodies stay on this device",
  "public share links (/s/…)",
  "email invites — viewer, editor, or admin",
  "local draft cache with reconnect retry",
  "import & export markdown or JSON",
  "realtime collab on shared pages",
  "magic link and Google sign-in",
] as const;
