import { AIProvider, ChatMessage, ImageAttachment } from "../types";

// Anthropic uses a non-OpenAI stream shape; implement directly.
async function* streamAnthropic(opts: {
  apiKey: string; model: string; messages: ChatMessage[];
  systemInstruction?: string; signal?: AbortSignal; images?: ImageAttachment[];
}): AsyncGenerator<string, void, unknown> {
  const buildContent = (text: string, attach?: ImageAttachment[]) => {
    if (!attach || attach.length === 0) return text;
    return [
      { type: "text", text },
      ...attach.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.base64 },
      })),
    ];
  };
  const msgs = opts.messages.map((m, i) => {
    const role = m.role === "model" ? "assistant" : "user";
    const isLastUser = i === opts.messages.length - 1 && m.role === "user";
    return {
      role,
      content: buildContent(m.content, isLastUser ? opts.images : undefined),
    };
  });
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 16384,
      stream: true,
      ...(opts.systemInstruction ? { system: opts.systemInstruction } : {}),
      messages: msgs,
    }),
    signal: opts.signal,
  });
  if (!resp.ok || !resp.body) {
    let detail = ""; try { detail = await resp.text(); } catch {}
    throw new Error(`Anthropic error (${resp.status}): ${detail.slice(0, 300) || resp.statusText}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const evt = JSON.parse(json);
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          yield evt.delta.text as string;
        }
      } catch { /* ignore */ }
    }
  }
}

export const anthropic: AIProvider = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  keyHelpUrl: "https://console.anthropic.com/settings/keys",
  keyPlaceholder: "sk-ant-…",
  models: [
    { id: "claude-fable-5", label: "Claude Fable 5", vision: true, group: "current" },
    { id: "claude-opus-5", label: "Claude Opus 5", vision: true, group: "current" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", vision: true, group: "current" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", vision: true, group: "current" },
  ],
  stream(opts, apiKey) {
    return streamAnthropic({ apiKey, ...opts });
  },
};
