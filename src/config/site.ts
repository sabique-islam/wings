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
  /**
   * Canonical social card. JPEG 1200×630 under 300 KB — WhatsApp's ceiling —
   * and accepted by Facebook, LinkedIn, X, Slack, Discord, Telegram, iMessage.
   * PNG/WebP are not used here: LinkedIn and older X clients still skip WebP,
   * and the PNG is too large for WhatsApp.
   */
  ogImage: "https://wings.nopejs.me/og.jpg",
  ogImageType: "image/jpeg",
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt:
    "Wings — a night forest path lit by glowing mushrooms, with the Wings wordmark",
  twitterHandle: "@nopeJS",
  /** IndexNow key hosted at /{key}.txt - run `bun run indexnow` after deploy. */
  indexNowKey: "6ab4230d7edd3da701967b8b96d715b3",
} as const;
