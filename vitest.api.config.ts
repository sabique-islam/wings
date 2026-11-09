import { defineConfig } from "vitest/config";

// Server tests need Node, not the editor DOM setup.
export default defineConfig({
  test: { environment: "node", include: ["src/server/api/api.test.ts"] },
});
