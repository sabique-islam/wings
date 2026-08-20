import {
  APPLIED_TO_PAGE_NOTICE,
  canApplyAiTools,
  toolsIgnoredNotice,
  type AssistantMode,
} from "./assistantMode";

export type AiToolKind = "write" | "replace" | "newpage" | "image";

export interface ParsedAiTool {
  kind: AiToolKind;
  body: string;
}

export function parseToolBlocks(text: string): { stripped: string; tools: ParsedAiTool[] } {
  const tools: ParsedAiTool[] = [];
  const re = /```tool:(write|replace|newpage|image)\s*\n([\s\S]*?)```/g;
  const stripped = text.replace(re, (_m, kind: AiToolKind, body: string) => {
    tools.push({ kind, body: body.trim() });
    return "";
  });
  return { stripped: stripped.trim(), tools };
}

/**
 * Strip tool fences for display and decide whether they may run.
 * Tools apply only when the turn was prompted as Agent AND the panel is still Agent.
 */
export function finalizeAssistantOutput(
  raw: string,
  promptedMode: AssistantMode,
  currentMode: AssistantMode,
): { display: string; toolsToApply: ParsedAiTool[] } {
  const { stripped, tools } = parseToolBlocks(raw);
  const apply = canApplyAiTools(promptedMode) && canApplyAiTools(currentMode);

  if (apply) {
    return {
      display: stripped || (tools.length ? APPLIED_TO_PAGE_NOTICE : raw),
      toolsToApply: tools,
    };
  }

  if (tools.length) {
    return {
      display: stripped || toolsIgnoredNotice(currentMode === "agent" ? promptedMode : currentMode),
      toolsToApply: [],
    };
  }

  return { display: stripped || raw, toolsToApply: [] };
}
