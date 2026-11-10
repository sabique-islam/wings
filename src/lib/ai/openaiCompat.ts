// Shared streaming helper for OpenAI-compatible /chat/completions endpoints.
// All providers we support (OpenAI, Groq, xAI/Grok, Moonshot/Kimi, MiniMax,
// and most others) speak this dialect. Returns an async generator of text
// deltas so the caller can update the UI token-by-token.

import { ChatMessage, ImageAttachment } from "./types";

export interface OpenAICompatOptions {
  baseUrl: string; // e.g. https://api.openai.com/v1
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  systemInstruction?: string;
  signal?: AbortSignal;
  images?: ImageAttachment[];
  /** Some providers require extra headers (e.g. Anthropic-style). */
  extraHeaders?: Record<string, string>;
}

function buildMessages(
  messages: ChatMessage[],
  systemInstruction: string | undefined,
  images: ImageAttachment[] | undefined
) {
  const out: any[] = [];
  if (systemInstruction) out.push({ role: "system", content: systemInstruction });
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const role = m.role === "model" ? "assistant" : "user";
    const isLastUser = i === messages.length - 1 && m.role === "user";
    const attachments = m.role === "user" ? (isLastUser && images !== undefined ? images : m.images) : undefined;
    if (attachments?.length) {
      out.push({
        role,
        content: [
          { type: "text", text: m.content },
          ...attachments.map((img) => ({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })),
        ],
      });
    } else {
      out.push({ role, content: m.content });
    }
  }
  return out;
}

export async function* streamOpenAICompat(opts: OpenAICompatOptions): AsyncGenerator<string, void, unknown> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.apiKey}`,
    ...(opts.extraHeaders ?? {}),
  };
  const body = {
    model: opts.model,
    stream: true,
    messages: buildMessages(opts.messages, opts.systemInstruction, opts.images),
  };
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!resp.ok || !resp.body) {
    let detail = "";
    try { detail = await resp.text(); } catch {}
    throw new Error(`AI error (${resp.status}): ${detail.slice(0, 300) || resp.statusText}`);
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
      let line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const parsed = JSON.parse(json);
        const text = parsed?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) yield text;
      } catch { /* partial frame; ignore */ }
    }
  }
}
