import { convertRewrites } from '@vercel/routing-utils';
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
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const rules = convertRewrites(config.rewrites);
  const { absoluteUrl } = await import(pathToFileURL(path.join(output, 'server/nodeRequest.js')));
  const cases = [
    ['GET', '/.well-known/oauth-protected-resource', 200],
    ['GET', '/.well-known/oauth-protected-resource/api/mcp', 200],
    ['GET', '/.well-known/oauth-authorization-server', 200],
    ['GET', '/api/mcp', 405],
    ['POST', '/api/mcp', 401],
    ['POST', '/api/oauth/register', 400],
    ['POST', '/api/oauth/token', 400],
    ['GET', '/api/v1/pages', 401],
    ['GET', '/api/v1/search?q=launch', 401],
  ];
  for (const [method, incoming, expected] of cases) {
    const input = new URL(incoming, 'https://wings.example');
    const rule = rules.find(rule => new RegExp(rule.src).test(input.pathname));
    assert.ok(rule, `No rewrite for ${incoming}`);
    const match = input.pathname.match(new RegExp(rule.src));
    const rewritten = new URL(rule.dest.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? ''), input.origin);
    for (const [key, value] of input.searchParams) rewritten.searchParams.append(key, value);
    const request = { method, url: rewritten.pathname + rewritten.search, headers: { host: 'wings.example', 'x-forwarded-proto': 'https' }, readableEnded: true, body: '{}', on() {} };
    // Fail at the broken routing boundary, before masking it with another response.
    const canonical = new URL(absoluteUrl(request));
    const expectedPath = incoming.startsWith('/.well-known/oauth-protected-resource') ? '/.well-known/oauth-protected-resource' : input.pathname;
    assert.equal(canonical.pathname, expectedPath, `Rewrite changed ${incoming}`);
    assert.equal(canonical.searchParams.get('q'), input.searchParams.get('q'));
    const headers = {};
    let status;
    let body;
    await handler(request, {
      set statusCode(value) { status = value; },
      setHeader(key, value) { headers[key] = value; },
      end(value) { body = value; },
    });
    assert.equal(status, expected, `${method} ${incoming}`);
    if (incoming === '/api/mcp' && method === 'POST') assert.match(headers['www-authenticate'], /oauth-protected-resource/);
    if (expected === 200) {
      assert.match(headers['content-type'], /application\/json/);
      const metadata = JSON.parse(new TextDecoder().decode(body));
      if (incoming.endsWith('authorization-server')) assert.equal(metadata.registration_endpoint, 'https://wings.example/api/oauth/register');
      else assert.equal(metadata.resource, 'https://wings.example/api/mcp');
    }
    console.log(`Passed: ${method} ${incoming} → ${expected}`);
  }
  console.log('Actual Vercel rewrites and emitted Node ESM passed all API smoke checks.');
} finally {
  rmSync(output, { recursive: true, force: true });
}
