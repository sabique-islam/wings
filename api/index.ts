import { handleNode } from "../server/nodeRequest";

type NodeReq = Parameters<typeof handleNode>[0];
type NodeRes = Parameters<typeof handleNode>[1];

export const config = {
  api: { bodyParser: false },
};

/**
 * Single function for every /api/* route. Plain Vercel functions do not support
 * Next-style [...path] catch-alls, so vercel.json rewrites /api/:path+ here and
 * passes the original path in `__wings_path` (see server/nodeRequest.ts).
 */
export default function handler(req: NodeReq, res: NodeRes): Promise<void> {
  return handleNode(req, res);
}
