import { AIProvider } from "../types";
import { streamOpenAICompat } from "../openaiCompat";

export const openai: AIProvider = {
  id: "openai",
  label: "OpenAI",
  keyHelpUrl: "https://platform.openai.com/api-keys",
  keyPlaceholder: "sk-…",
  models: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", vision: true, group: "current" },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", vision: true, group: "current" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", vision: true, group: "current" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", vision: true, group: "dedicated", kind: "coding" },
  ],
  stream({ messages, systemInstruction, model, signal, images }, apiKey) {
    return streamOpenAICompat({
      baseUrl: "https://api.openai.com/v1",
      apiKey, model, messages, systemInstruction, signal, images,
    });
  },
  async generateImage(prompt, apiKey, signal) {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1024", n: 1 }),
      signal,
    });
    if (!resp.ok) throw new Error(`Image gen failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const json = await resp.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");
    return b64;
  },
};
