import type { FaqItem } from "@/components/Seo";

/** Visible FAQ copy for /docs. Must stay in sync with FAQPage JSON-LD. */
export const DOCS_FAQ: FaqItem[] = [
  {
    question: "How do I sign in to Wings?",
    answer:
      "Open /auth and use Google OAuth or a magic link email. Auth is Supabase PKCE. There is no third-party Wings API key.",
  },
  {
    question: "What is BYOK AI?",
    answer:
      "Bring-your-own-key. You configure a provider key in the browser. Keys stay local. Prompts go to the provider you choose when you open the AI panel with Cmd+J.",
  },
  {
    question: "What is the local vault?",
    answer:
      "Connect a folder on this device in Chrome or Edge. New pages can be Always local, Always cloud, or Ask each time. Local page bodies stay on disk as markdown; Wings stores the title so the sidebar still works. Shared and collab pages are always cloud.",
  },
  {
    question: "Are shared notes indexed by search engines?",
    answer:
      "No. Share links under /s/ are disallowed in robots.txt and marked noindex. They are for people you invite, not for SEO.",
  },
  {
    question: "How do I export my notes?",
    answer:
      "Export a page as markdown or JSON from the signed-in app, or download a zip of every page in vault layout. Drafts also cache locally when sync is unavailable.",
  },
  {
    question: "Is Wings free?",
    answer:
      "Yes for features that ship today. Paid plans for hosted AI credits are planned and not live yet.",
  },
  {
    question: "Is Wings open source?",
    answer:
      "Yes. Wings is licensed AGPL-3.0-or-later. Source is on GitHub at Sabique-Islam/wings.",
  },
  {
    question: "What happens if an empty save races a real note?",
    answer:
      "Wings blocks empty or near-empty saves from overwriting substantial server content, and empty drafts cannot replace non-empty server notes on reload.",
  },
];
