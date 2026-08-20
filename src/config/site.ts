/**
 * Site-wide marketing and discovery constants.
 *
 * Prerender/SSR note: the marketing shell is CSR-only (Vite SPA). Crawlers that
 * do not execute JS mostly see index.html defaults. The highest-impact classic
 * SEO unlock later is prerendering marketing routes (Vite prerender plugin,
 * Astro marketing site, or a small SSR layer) - deferred until content volume
 * justifies the ops cost. Static .md mirrors + Helmet Seo cover agents and
 * JS-capable crawlers in the meantime.
 */
export const SITE = {
  name: "wings",
  brand: "Wings",
  domain: "wings.nopejs.me",
  url: "https://wings.nopejs.me",
  description:
    "Block editor for nested pages with LaTeX math, Excalidraw drawings, and an AI panel. Keep page bodies in a local vault on this device, or share by link. Export markdown.",
  tagline: "notes, math, drawings, and ai in one editor.",
  ogTitle: "Wings | think in plain text. render in everything",
  ogDescription:
    "A corner for ideas | keep private pages on this device. Markdown, LaTeX, drawings, and an agentic AI without ever leaving the keyboard.",
  email: "mail@wings.nopejs.me",
  mail: {
    domain: "mail.wings.nopejs.me",
    from: {
      auth: "Wings <auth@mail.wings.nopejs.me>",
      app: "Wings <hello@mail.wings.nopejs.me>",
    },
  },
  social: {
    discord: "https://discord.gg/vjGdgreZqp",
    github: "https://github.com/Sabique-Islam",
    githubRepo: "https://github.com/Sabique-Islam/wings",
    twitter: "https://twitter.com/nopeJS",
  },
  /** Absolute social image (local /og.png is not shipped). */
  ogImage:
    "https://storage.googleapis.com/gpt-engineer-file-uploads/ITEhookfEOa8B0y7TYBaSkuVJxV2/social-images/social-1780576498159-wings-banner.webp",
  twitterHandle: "@nopeJS",
  /** IndexNow key hosted at /{key}.txt - run `bun run indexnow` after deploy. */
  indexNowKey: "6ab4230d7edd3da701967b8b96d715b3",
} as const;
