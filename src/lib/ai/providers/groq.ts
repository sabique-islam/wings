import { AIProvider } from "../types";
import { streamOpenAICompat } from "../openaiCompat";

export const groq: AIProvider = {
  id: "groq",
  label: "Groq",
  keyHelpUrl: "https://console.groq.com/keys",
  keyPlaceholder: "gsk_…",
  models: [
    { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", group: "current" },
    { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", group: "current" },
    { id: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B", vision: true, group: "dedicated" },
    { id: "groq/compound", label: "Groq Compound", group: "dedicated", kind: "system" },
  ],
  stream({ messages, systemInstruction, model, signal, images }, apiKey) {
    return streamOpenAICompat({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey, model, messages, systemInstruction, signal, images,
    });
  },
};
