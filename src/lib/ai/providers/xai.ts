import { AIProvider } from "../types";
import { streamOpenAICompat } from "../openaiCompat";

export const xai: AIProvider = {
  id: "xai",
  label: "Grok (xAI)",
  keyHelpUrl: "https://console.x.ai/",
  keyPlaceholder: "xai-…",
  models: [
    { id: "grok-4.6", label: "Grok 4.6", vision: true, group: "current" },
    { id: "grok-4.5", label: "Grok 4.5", vision: true, group: "current" },
    { id: "grok-4.3", label: "Grok 4.3", vision: true, group: "current" },
  ],
  stream({ messages, systemInstruction, model, signal, images }, apiKey) {
    return streamOpenAICompat({
      baseUrl: "https://api.x.ai/v1",
      apiKey, model, messages, systemInstruction, signal, images,
    });
  },
};
