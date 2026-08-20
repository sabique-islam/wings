export interface LegalSection { h?: string; p: string }
export interface LegalDoc {
  slug: "privacy" | "terms" | "security" | "cookies";
  eyebrow: string;
  title: string;
  description: string;
  sections: LegalSection[];
}

import { SITE } from "@/config/site";

const CONTROLLER = `${SITE.brand} (${SITE.domain})`;
const CONTACT = SITE.email;

export const LEGAL_DOCS: Record<LegalDoc["slug"], LegalDoc> = {
  privacy: {
    slug: "privacy",
    eyebrow: "legal · privacy",
    title: "your notes are yours.",
    description: `Privacy policy for ${SITE.brand} — what we collect, why we collect it, and how to make it go away.`,
    sections: [
      { h: "controller", p: `${CONTROLLER} is the data controller for personal data processed via this site. Contact: ${CONTACT}.` },
      { h: "what we collect", p: "Account data (email address, optional display name and username). For cloud pages, the content you create (notes, drafts, drawings, attachments). For local vault pages, the title and metadata needed to list the page in the sidebar — the body stays on your device. Minimal technical metadata required to deliver the service (IP address at request time, browser user agent, timestamps). Cookie preferences you set on this site." },
      { h: "local vault", p: "If you connect a vault folder and mark a page Always local, the page body is written as markdown on that device. We do not store the body on our servers. Shared and collaborative pages are always stored in the cloud. Vault folder access uses the browser's directory picker (Chrome or Edge)." },
      { h: "what we don't collect", p: "We do not run third-party advertising trackers, fingerprinting scripts, or analytics that identify you. We do not buy or sell personal data. We do not profile you for targeted advertising." },
      { h: "legal bases (GDPR art. 6)", p: "Contract: to provide the editor, sync, and sharing features you signed up for. Legitimate interest: to keep the service secure, prevent abuse, and debug errors. Consent: for marketing cookies, which are off by default and stored locally. Analytics cookies are on by default and can be turned off in the cookie banner." },
      { h: "ai prompts", p: "When you invoke the agent (⌘J or slash command), the active page content and a small amount of context are sent to the model provider you configured (Google AI Studio by default). We do not retain copies of those prompts on our servers beyond transient request logs." },
      { h: "subprocessors", p: "We rely on Supabase (database, auth, storage, edge functions) and Cloudflare (CDN/edge). They process data only as instructed and under appropriate data processing terms." },
      { h: "international transfers", p: "Hosting is in the EU/US. Where data is transferred outside the EEA, Standard Contractual Clauses (SCCs) and supplementary measures apply." },
      { h: "retention", p: "Account and content remain until you delete them. Backups are rotated within 30 days of deletion. Server access logs are kept for up to 14 days for security." },
      { h: "your rights (EU/UK)", p: `Access, rectification, erasure, restriction, portability, and objection. To exercise any of these, email ${CONTACT}. You also have the right to lodge a complaint with your local supervisory authority.` },
      { h: "children", p: "Wings is not directed to children under 16. If you believe a child has provided us personal data, contact us and we will delete it." },
      { h: "changes", p: "Material changes are announced in-app before they take effect. The 'last updated' date at the top reflects the current revision." },
    ],
  },
  terms: {
    slug: "terms",
    eyebrow: "legal · terms",
    title: "the short version.",
    description: `Terms of service for ${SITE.brand}. You own your content. We provide the tools.`,
    sections: [
      { h: "agreement", p: `By creating an account or otherwise using ${SITE.brand}, you agree to these terms. If you don't agree, don't use the service.` },
      { h: "your account", p: "You must provide a valid email address and keep your sign-in credentials confidential. You're responsible for activity that happens under your account." },
      { h: "acceptable use", p: "Don't use Wings to break the law, infringe intellectual property, harass anyone, distribute malware, or send unsolicited bulk communications. Don't attempt to disrupt or reverse-engineer the service." },
      { h: "your content", p: "You retain ownership of everything you create. You grant us only the limited, worldwide, royalty-free license needed to store, transmit, and display your content back to you and the collaborators you explicitly invite." },
      { h: "publishing", p: "If you publish a page to the web, you confirm you have the right to share that content publicly. You can unpublish at any time and we will revoke the public URL." },
      { h: "service availability", p: "We work hard for high uptime but make no guarantees. The service is provided 'as is' without warranties. Always keep your own export of work that matters — exports are one click away." },
      { h: "pricing", p: "Free tiers may have usage limits. Paid plans are billed by our payment processor; refunds follow that processor's policy unless local law requires otherwise. The EU 14-day right of withdrawal applies where applicable." },
      { h: "termination", p: "You can close your account at any time from settings. We may suspend accounts that materially violate these terms, with notice when possible." },
      { h: "liability", p: "To the extent permitted by law, our aggregate liability for any claim is capped at the fees you paid us in the 12 months before the claim arose. Nothing in these terms limits liability that cannot be limited by law (e.g. gross negligence, willful misconduct)." },
      { h: "governing law", p: "These terms are governed by the laws applicable at our place of establishment, without regard to conflict-of-laws principles. Mandatory consumer protections in your country of residence still apply." },
      { h: "contact", p: `Questions about these terms? ${CONTACT}.` },
    ],
  },
  security: {
    slug: "security",
    eyebrow: "legal · security",
    title: "boring is good.",
    description: `Security practices for ${SITE.brand}: TLS, row-level security, passwordless auth, and a 48-hour disclosure window.`,
    sections: [
      { h: "transport", p: "All traffic moves over TLS 1.3. HSTS is enabled. Session cookies are HTTP-only, SameSite=Lax, and Secure in production." },
      { h: "at rest", p: "Postgres-managed encryption at rest for cloud content. Local vault page bodies are not stored on our servers — they live in a folder you connect on your device. Object storage (drawings, image attachments) uses signed URLs with short expirations." },
      { h: "authorization", p: "Row-level security policies enforce per-user access at the database, not in the UI. Shared pages are gated by signed share tokens with role-scoped capabilities." },
      { h: "authentication", p: "Passwordless: magic link, 6-digit OTP, or managed Google OAuth. No passwords means nothing to leak. Sessions are revocable from settings." },
      { h: "backups", p: "Encrypted daily snapshots retained for 30 days. Deleted content is purged from backups within that window." },
      { h: "isolation", p: "Edge functions run with least-privilege service keys. Per-user secrets (model API keys, etc.) stay in the user's browser unless they explicitly opt in to server-side use." },
      { h: "disclosure", p: `Found something? Email ${CONTACT}. We acknowledge within 48 hours, fix within an agreed window, and credit researchers who report responsibly.` },
    ],
  },
  cookies: {
    slug: "cookies",
    eyebrow: "legal · cookies",
    title: "we use one. it logs you in.",
    description: `Cookie policy for ${SITE.brand}. One essential session cookie. Anonymous analytics on by default; marketing cookies opt-in only.`,
    sections: [
      { h: "essential", p: "A single HTTP-only session cookie keeps you signed in. Without it, you cannot use the editor. This cookie is exempt from consent under the ePrivacy Directive because it is strictly necessary." },
      { h: "preferences", p: "Theme, accent color, sidebar width, and draft text are stored in your browser's localStorage. They never leave your device and are not used for tracking." },
      { h: "analytics", p: "On by default. We load privacy-respecting product analytics (Vercel Analytics) to count active features and improve the product. No cross-site identifiers. You can turn analytics off via the consent banner or footer link." },
      { h: "marketing", p: "Off by default. Wings does not currently use marketing or advertising cookies." },
      { h: "managing consent", p: "You can revisit your choices at any time by clicking 'manage cookies' in the footer, or by clearing site data in your browser." },
      { h: "third parties", p: "We do not embed third-party widgets, social pixels, or ad networks on our marketing pages." },
    ],
  },
};
