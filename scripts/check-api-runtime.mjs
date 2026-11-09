import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise emitted ESM with Node's resolver, rather than Vite's permissive resolver.
const root = process.cwd();
const output = mkdtempSync(path.join(root, '.api-runtime-check-'));
const visited = new Set();
function emit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    assert.ok(match[1].endsWith('.js'), `Node ESM import needs .js: ${file}: ${match[1]}`);
    emit(path.resolve(path.dirname(file), match[1].replace(/\.js$/, '.ts')));
  }
  const destination = path.join(output, path.relative(root, file).replace(/\.ts$/, '.js'));
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, stripTypeScriptTypes(source));
}
try {
  emit(path.join(root, 'api/index.ts'));
  const { default: handler } = await import(pathToFileURL(path.join(output, 'api/index.js')));
  // Dummy configuration; stub only the rate limiter and reject unexpected requests.
  process.env.API_TOKEN_PEPPER = 'test-pepper-0123456789abcdef0123456789';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  process.env.API_PUBLIC_ORIGIN = 'https://wings.example';
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://example.supabase.co/rest/v1/rpc/api_rate_hit');
    return new Response('true', { headers: { 'content-type': 'application/json' } });
  };
  const headers = {};
  let status;
  await handler({ method: 'POST', url: '/api?__wings_path=mcp', headers: { host: 'wings.example', 'x-forwarded-proto': 'https' }, readableEnded: true, body: '{}', on() {} }, {
    set statusCode(value) { status = value; },
    setHeader(key, value) { headers[key] = value; },
    end() {},
  });
  assert.equal(status, 401);
  assert.match(headers['www-authenticate'], /oauth-protected-resource/);
  console.log('API loads as emitted Node ESM; MCP POST returns the OAuth challenge.');
} finally {
  rmSync(output, { recursive: true, force: true });
}
