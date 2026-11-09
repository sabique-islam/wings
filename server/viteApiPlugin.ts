import { loadEnv, type Plugin } from "vite";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * The dev server listens on every interface (`host: "::"`) so phones on the LAN
 * can load the app. The API runs with the service-role key, so only this
 * machine may reach it.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  return Boolean(address && LOOPBACK.has(address));
}

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
        if (!isLoopbackAddress(req.socket.remoteAddress)) {
          res.statusCode = 403;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "The dev API only answers requests from this machine." }));
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
