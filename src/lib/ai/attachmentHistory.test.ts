import { afterEach, describe, expect, it, vi } from "vitest";
import { streamOpenAICompat } from "./openaiCompat";
import { google } from "./providers/google";
import { anthropic } from "./providers/anthropic";
import type { StreamOptions } from "./types";

afterEach(() => vi.unstubAllGlobals());
describe("attachment history across providers", () => {
  it.each(["openai", "google", "anthropic"])("resends the original image on a follow-up with %s", async (provider) => {
    const fetch = vi.fn().mockResolvedValue(new Response("data: [DONE]\n", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const opts: StreamOptions = { model: "test", messages: [{ role: "user", content: "Look", images: [{ base64: "cGljdHVyZQ==", mimeType: "image/png" }] }, { role: "model", content: "A diagram" }, { role: "user", content: "Explain it" }] };
    const stream = provider === "openai" ? streamOpenAICompat({ ...opts, apiKey: "test", baseUrl: "https://example.com" }) : (provider === "google" ? google : anthropic).stream(opts, "test");
    for await (const chunk of stream) void chunk;
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(JSON.stringify((body.messages || body.contents)[0])).toContain("cGljdHVyZQ==");
    expect(JSON.stringify((body.messages || body.contents)[2])).not.toContain("cGljdHVyZQ==");
  });
});
