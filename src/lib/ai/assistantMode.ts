// Ask / Plan / Agent — Cursor-style modes so the panel does not write
// unless the user explicitly chose Agent.

export type AssistantMode = "ask" | "plan" | "agent";

export const ASSISTANT_MODES: {
  id: AssistantMode;
  label: string;
  description: string;
}[] = [
  { id: "ask", label: "Ask", description: "Answers only. Never edits pages." },
  { id: "plan", label: "Plan", description: "Proposes a plan. Never edits pages." },
  { id: "agent", label: "Agent", description: "Can write, replace, create pages, and generate images." },
];

const MODE_KEY = "wings_ai_mode";

const SHARED = `You are an embedded writing assistant inside Wings, a Notion-style markdown editor.
You help the user think, write, and organize pages.

Rules:
- Markdown only: # headings, lists, tables, code, math ($...$ / $$...$$), task lists (- [ ]).
- If excalidraw drawings from the current page are attached as images, reference them naturally.
- If the user attaches images, analyze them and respond accordingly.
- Keep prose tight. No fluff.`;

const TOOL_PROTOCOL = `You may emit fenced action blocks at the start of a line. Use them ONLY when the user wants you to modify their workspace. Otherwise just chat in markdown.

Tools (each must be its own fenced block):

\`\`\`tool:write
<markdown to APPEND to the current page>
\`\`\`

\`\`\`tool:replace
<markdown that REPLACES the entire current page>
\`\`\`

\`\`\`tool:newpage
title: <title>
---
<markdown body>
\`\`\`

\`\`\`tool:image
<image prompt — a clear, descriptive sentence>
\`\`\``;

const NO_TOOLS = `Do NOT modify the workspace. Do NOT emit tool:write, tool:replace, tool:newpage, or tool:image blocks.
If the user wants changes applied, tell them to switch to Agent mode.`;

export const APPLIED_TO_PAGE_NOTICE = "_(applied to your page)_";

export function isAssistantMode(value: string): value is AssistantMode {
  return value === "ask" || value === "plan" || value === "agent";
}

export function getAssistantMode(): AssistantMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored && isAssistantMode(stored)) return stored;
  } catch {
    // private mode / missing localStorage
  }
  return "ask";
}

export function setAssistantMode(mode: AssistantMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}

export function canApplyAiTools(mode: AssistantMode): boolean {
  return mode === "agent";
}

export function systemPromptFor(mode: AssistantMode): string {
  if (mode === "ask") {
    return `${SHARED}

You are in Ask mode. Answer questions about the open page and workspace.
${NO_TOOLS}`;
  }
  if (mode === "plan") {
    return `${SHARED}

You are in Plan mode. Propose a clear plan before any edits. Show proposed markdown in ordinary fenced code blocks (language \`md\` or \`markdown\`), never as tool:* blocks.
${NO_TOOLS}`;
  }
  return `${SHARED}

You are in Agent mode.
${TOOL_PROTOCOL}`;
}

export function toolsIgnoredNotice(mode: AssistantMode): string {
  const label = mode === "plan" ? "Plan" : "Ask";
  return `_(write tools are disabled in ${label} mode — switch to Agent to apply changes)_`;
}

export function placeholderFor(mode: AssistantMode): string {
  if (mode === "ask") return "Ask about this page…";
  if (mode === "plan") return "Describe what you want planned…";
  return "Ask AI to write, edit, create, or generate images…";
}

export function emptyStateBlurb(mode: AssistantMode): string {
  if (mode === "ask") return "Ask questions about this page. I will not edit anything.";
  if (mode === "plan") return "I'll outline a plan. Switch to Agent when you want changes applied.";
  return "Ask me to write, edit, create pages, generate images, or attach a photo to analyze.";
}
