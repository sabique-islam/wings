import { loadEnv, type Plugin } from "vite";

/** Forward /api and OAuth metadata to the same handler production uses. */
export function wingsApiPlugin(mode: string): Plugin {
  return {
    name: "wings-api",
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), "");
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] == null) process.env[key] = value;
      }
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        const api = path === "/api" || path.startsWith("/api/");
        const metadata = path.startsWith("/.well-known/oauth-protected-resource")
          || path === "/.well-known/oauth-authorization-server";
        if (!api && !metadata) {
          next();
          return;
        }
        // Loaded through the dev server so the @ alias resolves. A static import
        // here is pulled into the Vite config bundle before that alias exists.
        server.ssrLoadModule("/server/nodeRequest.ts")
          .then((mod) => {
            const handleNode = mod.handleNode as (incoming: typeof req, outgoing: typeof res) => Promise<void>;
            return handleNode(req, res);
          })
          .catch((error: unknown) => {
            next(error instanceof Error ? error : new Error("api"));
          });
      });
    },
  };
}
