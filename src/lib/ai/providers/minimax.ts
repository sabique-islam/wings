import { AIProvider } from "../types";
import { streamOpenAICompat } from "../openaiCompat";

// MiniMax exposes an OpenAI-compatible endpoint at /v1/text/chatcompletion_v2,
// but they also support the standard /v1/chat/completions shape. We use that.
export const minimax: AIProvider = {
  id: "minimax",
  label: "MiniMax",
  keyHelpUrl: "https://platform.minimax.io/user-center/basic-information/interface-key",
  keyPlaceholder: "Bearer key",
  models: [
    { id: "MiniMax-M3", label: "MiniMax M3", vision: true, group: "current" },
    { id: "MiniMax-M2.7", label: "MiniMax M2.7", group: "current" },
    { id: "MiniMax-M2.7-highspeed", label: "MiniMax M2.7 Highspeed", group: "current" },
  ],
  stream({ messages, systemInstruction, model, signal, images }, apiKey) {
    return streamOpenAICompat({
      baseUrl: "https://api.minimax.io/v1",
      apiKey, model, messages, systemInstruction, signal, images,
    });
  },
};
