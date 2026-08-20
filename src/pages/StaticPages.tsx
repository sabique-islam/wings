import InfoPage from "./InfoPage";
import { SITE } from "@/config/site";
import { DOCS_FAQ } from "@/content/docsFaq";

export function About() {
  return (
    <InfoPage
      eyebrow="company · about"
      title="what Wings is."
      path="/about"
      description="Wings is a web notes app with nested pages, a local vault folder, LaTeX, Excalidraw, and a BYOK AI panel. Built for keyboard-first writing."
    >
      <p className="text-muted-foreground">
        {SITE.brand} is a web-based notes app: nested pages, a block editor, LaTeX math, Excalidraw drawings, and an AI panel that reads the page you have open. Keep private pages in a folder on this device, or share by public link or email invite.
      </p>
      <p className="text-muted-foreground">
        It started after a Notion workspace limit in February 2026 and moved onto a personal React, Vite, Supabase, and TipTap stack in July 2026. The editor runs in the browser. Cloud pages sync through Supabase. Local vault pages keep the body on a folder you connect — Wings only stores the title so the sidebar still works. AI calls go to whichever provider you configure. Keys stay in your browser, not on our servers.
      </p>
      <p className="text-muted-foreground">
        Source is AGPL-3.0 on{" "}
        <a href={SITE.social.githubRepo} className="underline underline-offset-2 hover:text-foreground">
          GitHub
        </a>
        . Live product:{" "}
        <a href={SITE.url} className="underline underline-offset-2 hover:text-foreground">
          {SITE.domain}
        </a>
        .
      </p>
    </InfoPage>
  );
}

export function Careers() {
  return (
    <InfoPage
      eyebrow="company · careers"
      title="not hiring right now."
      path="/careers"
      description="Wings is not hiring right now. Reach out anyway at our contact email if you want to say hello."
    >
      <p className="text-muted-foreground">
        we don't have open roles at the moment. when we do, they'll be listed here.
      </p>
      <p className="text-muted-foreground pt-2">
        if you want to reach out anyway:{" "}
        <a href={`mailto:${SITE.email}`} className="underline underline-offset-2 hover:text-foreground">
          {SITE.email}
        </a>
      </p>
    </InfoPage>
  );
}

export function Contact() {
  return (
    <InfoPage
      eyebrow="company · contact"
      title="get in touch."
      path="/contact"
      description={`Contact Wings at ${SITE.email} for bugs, account issues, security reports, and general questions.`}
    >
      <p className="text-muted-foreground pt-2">
        one inbox for everything: bugs, account issues, security reports, and general questions.
      </p>
      <div className="border border-border/60 rounded-lg p-5 mt-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">email</div>
        <a href={`mailto:${SITE.email}`} className="text-sm font-mono mt-2 block hover:underline">{SITE.email}</a>
      </div>
      <p className="text-xs text-muted-foreground pt-4">
        for security vulnerabilities, please include steps to reproduce. we aim to respond within a few business days. Also see{" "}
        <a href="/.well-known/security.txt" className="underline underline-offset-2 hover:text-foreground">security.txt</a>.
      </p>
    </InfoPage>
  );
}

export function Roadmap() {
  const groups = [
    {
      h: "shipped",
      items: [
        "block editor with slash commands",
        "LaTeX math & Excalidraw",
        "AI panel + inline edits (⌘J)",
        "local vault folder (page bodies on this device)",
        "nested pages, pin, trash",
        "public share links & email invites",
        "draft cache + markdown/JSON export",
        "magic link & Google sign-in",
      ],
    },
    {
      h: "in progress",
      items: [
        "paid plans & hosted AI credits",
        "version history",
        "table of contents block",
        "real-time collaboration (optional collab server)",
      ],
    },
    {
      h: "exploring",
      items: [
        "mobile app",
        "plugin API",
      ],
    },
  ];
  return (
    <InfoPage
      eyebrow="product · roadmap"
      title="what exists and what's next."
      path="/roadmap"
      description="Wings roadmap: shipped features, work in progress, and ideas we are exploring."
    >
      <p className="text-muted-foreground">
        this is an honest list, not a commitment. things move as we learn what people actually use.
      </p>
      <div className="grid md:grid-cols-3 gap-4 pt-4">
        {groups.map((g) => (
          <div key={g.h} className="border border-border/60 rounded-lg p-5">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">{g.h}</div>
            <ul className="space-y-2">
              {g.items.map((it) => <li key={it} className="text-sm font-mono text-muted-foreground">▸ {it}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </InfoPage>
  );
}

export function Docs() {
  return (
    <InfoPage
      eyebrow="resources · docs"
      title="using Wings."
      path="/docs"
      description="Wings docs: sign-in, local vault, sharing, export, BYOK AI, keyboard shortcuts, and FAQ."
      faq={DOCS_FAQ}
    >
      <p className="text-muted-foreground">
        Prefer markdown? Agents can fetch{" "}
        <a href="/docs.md" className="underline underline-offset-2 hover:text-foreground">/docs.md</a>
        {" "}or request <code className="text-xs">Accept: text/markdown</code> on this page. Essays:{" "}
        <a href="/blog" className="underline underline-offset-2 hover:text-foreground">/blog</a>.
      </p>

      <h2 className="text-base font-mono uppercase tracking-tight pt-6">sign in</h2>
      <p className="text-muted-foreground">
        Open <a href="/auth" className="underline underline-offset-2 hover:text-foreground">/auth</a>. Use Google OAuth or a magic link (email OTP). Auth is Supabase PKCE; there is no Wings API key for third parties. See{" "}
        <a href="/auth.md" className="underline underline-offset-2 hover:text-foreground">auth.md</a>.
      </p>

      <h2 className="text-base font-mono uppercase tracking-tight pt-6">local vault</h2>
      <p className="text-muted-foreground">
        Connect a folder on this device (Chrome or Edge). New pages can be Always local, Always cloud, or Ask each time.
      </p>
      <ul className="list-none space-y-2 pl-0">
        <li className="text-muted-foreground">▸ Always local: the page body stays on disk as markdown. Wings stores the title so the sidebar still works. Not shareable.</li>
        <li className="text-muted-foreground">▸ Always cloud: shareable and synced across devices</li>
        <li className="text-muted-foreground">▸ Shared and collab pages are always cloud — collaborators never own a local vault body</li>
      </ul>

      <h2 className="text-base font-mono uppercase tracking-tight pt-6">sharing</h2>
      <ul className="list-none space-y-2 pl-0">
        <li className="text-muted-foreground">▸ public link (<code className="text-xs">/s/:token</code>): view or edit by role; these URLs are noindex</li>
        <li className="text-muted-foreground">▸ email invite with viewer / editor / admin roles</li>
      </ul>

      <h2 className="text-base font-mono uppercase tracking-tight pt-6">export and drafts</h2>
      <ul className="list-none space-y-2 pl-0">
        <li className="text-muted-foreground">▸ export a page as markdown or JSON from the app</li>
        <li className="text-muted-foreground">▸ download a zip of every page in vault-layout markdown</li>
        <li className="text-muted-foreground">▸ offline draft cache keeps recent edits in the browser</li>
        <li className="text-muted-foreground">▸ empty saves cannot overwrite substantial server content</li>
      </ul>

      <h2 className="text-base font-mono uppercase tracking-tight pt-6">AI (BYOK)</h2>
      <p className="text-muted-foreground">
        Open the AI panel with ⌘J (Ctrl+J). Configure your own provider keys in the browser. Keys stay local; prompts go to the provider you choose.
      </p>

      <h2 className="text-base font-mono uppercase tracking-tight pt-6">keyboard shortcuts</h2>
      <p className="text-muted-foreground">
        Press ⌘? (or Ctrl+?) anywhere in the app for the full shortcut list.
      </p>
      <h3 className="text-sm font-mono uppercase tracking-tight pt-4 text-muted-foreground">navigation</h3>
      <div className="grid sm:grid-cols-2 gap-2 pt-2">
        {[
          ["⌘K", "command palette"],
          ["⌘N", "new page"],
          ["⌘P", "quick switcher"],
          ["⌘B", "toggle sidebar"],
          ["⌘/", "search sidebar"],
          ["⌘J", "AI panel"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border border-border/60 rounded-md px-3 py-2">
            <span className="text-xs font-mono text-muted-foreground">{v}</span>
            <kbd className="text-xs font-mono bg-accent/40 rounded px-2 py-0.5">{k}</kbd>
          </div>
        ))}
      </div>
      <h3 className="text-sm font-mono uppercase tracking-tight pt-6 text-muted-foreground">editing</h3>
      <div className="grid sm:grid-cols-2 gap-2 pt-2">
        {[
          ["/", "slash commands (type at line start)"],
          ["⌘B", "bold"],
          ["⌘I", "italic"],
          ["⌘U", "underline"],
          ["⌘E", "inline code"],
          ["⌘⇧S", "strikethrough"],
          ["⌘D", "duplicate block"],
          ["⌘⇧↑/↓", "move block"],
          ["⌘⌥0–8", "turn into"],
          ["Tab", "indent list"],
          ["Esc", "select block"],
        ].map(([k, v]) => (
          <div key={k + v} className="flex items-center justify-between border border-border/60 rounded-md px-3 py-2">
            <span className="text-xs font-mono text-muted-foreground">{v}</span>
            <kbd className="text-xs font-mono bg-accent/40 rounded px-2 py-0.5">{k}</kbd>
          </div>
        ))}
      </div>

      <h2 className="text-base font-mono uppercase tracking-tight pt-10">FAQ</h2>
      <div className="space-y-5 pt-2">
        {DOCS_FAQ.map((item) => (
          <section key={item.question} className="space-y-2">
            <h3 className="text-sm font-mono text-foreground">{item.question}</h3>
            <p className="text-muted-foreground">{item.answer}</p>
          </section>
        ))}
      </div>
    </InfoPage>
  );
}

export function Support() {
  return (
    <InfoPage
      eyebrow="resources · support"
      title="need help?"
      path="/support"
      description="Get help with Wings: docs for shortcuts and usage, or email for account and bug reports."
    >
      <p className="text-muted-foreground">
        check the <a href="/docs" className="underline underline-offset-2 hover:text-foreground">docs</a> for sign-in, local vault, sharing, export, AI, and keyboard shortcuts.
      </p>
      <p className="text-muted-foreground pt-2">
        for account issues, bugs, or anything else, email{" "}
        <a href={`mailto:${SITE.email}`} className="underline underline-offset-2 hover:text-foreground">{SITE.email}</a>. we typically reply within a few business days.
      </p>
    </InfoPage>
  );
}

export function Status() {
  return (
    <InfoPage
      eyebrow="resources · status"
      title="no status page yet."
      path="/status"
      description="Wings does not run a public uptime monitor yet. Email us if something seems broken."
    >
      <p className="text-muted-foreground">
        we don't run a public uptime monitor. if something seems broken, email{" "}
        <a href={`mailto:${SITE.email}`} className="underline underline-offset-2 hover:text-foreground">
          {SITE.email}
        </a>{" "}
        and we'll look into it.
      </p>
      <p className="text-muted-foreground pt-2 text-sm">
        Wings depends on Supabase (auth + database) and your configured AI provider. outages there will affect sign-in, cloud sync, or AI. local vault page bodies stay on this device; the draft cache still covers unsaved edits.
      </p>
    </InfoPage>
  );
}

export function Press() {
  return (
    <InfoPage
      eyebrow="resources · press"
      title="press kit."
      path="/press"
      description="Boilerplate and contact for Wings press inquiries."
    >
      <h2 className="text-base font-mono uppercase tracking-tight">boilerplate</h2>
      <p className="text-muted-foreground">
        Wings is a web notes app with nested pages, a block editor, LaTeX math, Excalidraw drawings, a local vault folder for private page bodies, and a bring-your-own-key AI panel. It is free for features that ship today, open source under AGPL-3.0, and hosted at {SITE.domain}.
      </p>
      <h2 className="text-base font-mono uppercase tracking-tight pt-6">assets</h2>
      <ul className="list-none space-y-2 pl-0">
        <li className="text-muted-foreground">
          ▸ logo:{" "}
          <a href="/wings-logo.png" className="underline underline-offset-2 hover:text-foreground">
            /wings-logo.png
          </a>
        </li>
        <li className="text-muted-foreground">
          ▸ site:{" "}
          <a href={SITE.url} className="underline underline-offset-2 hover:text-foreground">
            {SITE.url}
          </a>
        </li>
        <li className="text-muted-foreground">
          ▸ source:{" "}
          <a href={SITE.social.githubRepo} className="underline underline-offset-2 hover:text-foreground">
            {SITE.social.githubRepo}
          </a>
        </li>
      </ul>
      <h2 className="text-base font-mono uppercase tracking-tight pt-6">contact</h2>
      <p className="text-muted-foreground">
        Email {SITE.email} with your outlet, deadline, and what you need. We do not have a full media kit yet.
      </p>
    </InfoPage>
  );
}
