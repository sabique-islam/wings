import { handleNode } from "../server/nodeRequest";

type NodeReq = Parameters<typeof handleNode>[0];
type NodeRes = Parameters<typeof handleNode>[1];

export const config = {
  api: { bodyParser: false },
};

/** Catch-all for /api/* and, when routed here, OAuth metadata. */
export default function handler(req: NodeReq, res: NodeRes): Promise<void> {
  return handleNode(req, res);
}
