// Shared AI types used by every provider adapter.

export type Role = "user" | "model" | "system";

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ImageAttachment {
  /** base64 data without the `data:image/png;base64,` prefix */
  base64: string;
  mimeType: string;
}

export interface StreamOptions {
  messages: ChatMessage[];
  systemInstruction?: string;
  model: string;
  signal?: AbortSignal;
  /** Optional image attachments appended to the LAST user message. */
  images?: ImageAttachment[];
}

export type ModelGroup = "current" | "dedicated";
export type ModelKind = "chat" | "coding" | "image" | "system";

export interface ProviderModel {
  id: string;
  label: string;
  /** marks the model as multimodal (accepts image inputs) */
  vision?: boolean;
  /** marks the model as capable of generating images */
  image?: boolean;
  /** current chat catalog vs dedicated coding/image/system IDs */
  group?: ModelGroup;
  /** dedicated-model role, used for picker icons */
  kind?: ModelKind;
}

export interface AIProvider {
  id: string;
  label: string;
  /** Where users can grab the API key */
  keyHelpUrl: string;
  /** Placeholder for the API-key input */
  keyPlaceholder: string;
  models: ProviderModel[];
  stream(opts: StreamOptions, apiKey: string): AsyncGenerator<string, void, unknown>;
  /** Optional image generation. Returns base64 PNG without the data URL prefix. */
  generateImage?(prompt: string, apiKey: string, signal?: AbortSignal): Promise<string>;
}
