import { AIProvider, ChatMessage, ImageAttachment } from "../types";

async function* streamGemini(opts: {
  apiKey: string; model: string; messages: ChatMessage[];
  systemInstruction?: string; signal?: AbortSignal; images?: ImageAttachment[];
}): AsyncGenerator<string, void, unknown> {
  const buildParts = (text: string, attach?: ImageAttachment[]) => {
    const parts: any[] = [{ text }];
    if (attach) for (const img of attach) parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
    return parts;
  };
  const contents = opts.messages.map((m, i) => ({
    role: m.role,
    parts: buildParts(m.content, i === opts.messages.length - 1 && m.role === "user" ? opts.images : undefined),
  }));
  const body: any = { contents };
  if (opts.systemInstruction) {
    body.systemInstruction = { role: "user", parts: [{ text: opts.systemInstruction }] };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!resp.ok || !resp.body) {
    let detail = ""; try { detail = await resp.text(); } catch {}
    throw new Error(`Gemini error (${resp.status}): ${detail.slice(0, 300) || resp.statusText}`);
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
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const parsed = JSON.parse(json);
        const text = parsed?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
        if (text) yield text;
      } catch { /* partial */ }
    }
  }
}

export const google: AIProvider = {
  id: "google",
  label: "Google (Gemini)",
  keyHelpUrl: "https://aistudio.google.com/apikey",
  keyPlaceholder: "AIza…",
  models: [
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", vision: true, group: "current" },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", vision: true, group: "current" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", vision: true, group: "current" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", vision: true, group: "current" },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", vision: true, group: "current" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", vision: true, group: "current" },
    { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", vision: true, image: true, group: "dedicated", kind: "image" },
  ],
  stream(opts, apiKey) {
    return streamGemini({ apiKey, ...opts });
  },
  async generateImage(prompt, apiKey, signal) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal,
    });
    if (!resp.ok) throw new Error(`Gemini image gen failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const json = await resp.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
    const b64 = img?.inlineData?.data || img?.inline_data?.data;
    if (!b64) throw new Error("No image returned");
    return b64;
  },
};
