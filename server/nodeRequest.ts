import { handleRequest } from "../src/server/api/router";

type NodeReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  readableEnded?: boolean;
  on(event: "data", cb: (chunk: Uint8Array | string) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (error: unknown) => void): void;
};

type NodeRes = {
  statusCode: number;
  setHeader(name: string, value: string | number | readonly string[]): void;
  end(body?: Uint8Array | string): void;
};

function header(req: NodeReq, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function absoluteUrl(req: NodeReq): string {
  const proto = header(req, "x-forwarded-proto") ?? "http";
  const host = header(req, "x-forwarded-host") ?? header(req, "host") ?? "localhost";
  const path = req.url && req.url.length > 0 ? req.url : "/";
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}${path}`;
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function asBytes(value: unknown): Uint8Array | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") return encode(value);
  if (value instanceof Uint8Array) return value;
  if (typeof value === "object") return encode(JSON.stringify(value));
  return undefined;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function readRaw(req: NodeReq): Promise<Uint8Array | undefined> {
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (chunks.length > 0) {
        resolve(concat(chunks));
        return;
      }
      resolve(asBytes(req.body));
    };
    req.on("data", (chunk) => {
      if (chunk == null) return;
      chunks.push(typeof chunk === "string" ? encode(chunk) : new Uint8Array(chunk));
    });
    req.on("end", finish);
    req.on("error", finish);
    if (req.readableEnded) finish();
  });
}

/** Adapt a Node serverless request to the Web Request handler. */
export async function handleNode(req: NodeReq, res: NodeRes): Promise<void> {
  const method = req.method ?? "GET";
  const raw = method === "GET" || method === "HEAD" ? undefined : await readRaw(req);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const request = new Request(absoluteUrl(req), {
    method,
    headers,
    body: raw && raw.byteLength > 0 ? raw : undefined,
  });
  const response = await handleRequest(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  res.end(bytes.byteLength > 0 ? bytes : undefined);
}
