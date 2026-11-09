import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { wingsApiPlugin } from "./server/viteApiPlugin.ts";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    headers: {
      "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
    },
  },
  plugins: [react(), tailwindcss(), wingsApiPlugin(mode)],
  worker: {
    format: "es",
  },
  optimizeDeps: {
    include: ["mermaid"],
    exclude: ["@huggingface/transformers"],
  },
  assetsInclude: ["**/*.wasm"],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "prosemirror-model",
      "prosemirror-state",
      "prosemirror-view",
      "prosemirror-transform",
      "@tiptap/core",
      "@tiptap/pm",
      "@tiptap/suggestion",
    ],
  },
}));
