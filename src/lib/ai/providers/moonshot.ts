import { AIProvider } from "../types";
import { streamOpenAICompat } from "../openaiCompat";

// Moonshot / Kimi — OpenAI-compatible API.
export const moonshot: AIProvider = {
  id: "moonshot",
  label: "Kimi (Moonshot)",
  keyHelpUrl: "https://platform.kimi.ai/console/api-keys",
  keyPlaceholder: "sk-…",
  models: [
    { id: "kimi-k3", label: "Kimi K3", vision: true, group: "current" },
    { id: "kimi-k2.6", label: "Kimi K2.6", vision: true, group: "current" },
    { id: "kimi-k2.7-code", label: "Kimi K2.7 Code", vision: true, group: "dedicated", kind: "coding" },
    { id: "kimi-k2.7-code-highspeed", label: "Kimi K2.7 Code Highspeed", vision: true, group: "dedicated", kind: "coding" },
  ],
  stream({ messages, systemInstruction, model, signal, images }, apiKey) {
    return streamOpenAICompat({
      baseUrl: "https://api.moonshot.ai/v1",
      apiKey, model, messages, systemInstruction, signal, images,
    });
  },
};
