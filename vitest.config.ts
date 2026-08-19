import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
    dedupe: [
      "prosemirror-model",
      "prosemirror-state",
      "prosemirror-view",
      "prosemirror-transform",
      "@tiptap/core",
      "@tiptap/pm",
    ],
  },
});
