import assert from 'node:assert/strict';

const origin = new URL(process.argv[2] ?? 'https://wings.nopejs.me').origin;
assert.ok(origin.startsWith('https://'), 'Use an HTTPS deployment URL');
for (const route of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp', '/.well-known/oauth-authorization-server']) {
  const response = await fetch(origin + route, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  assert.equal(response.status, 200, route);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/, route);
  const metadata = await response.json();
  if (route.endsWith('authorization-server')) {
    assert.equal(metadata.issuer, origin);
    assert.equal(metadata.registration_endpoint, origin + '/api/oauth/register');
    assert.equal(metadata.token_endpoint, origin + '/api/oauth/token');
    assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
  } else {
    assert.equal(metadata.resource, origin + '/api/mcp');
    assert.deepEqual(metadata.authorization_servers, [origin]);
  }
  console.log(`Passed: GET ${route} → 200 JSON`);
}
const response = await fetch(origin + '/api/mcp', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Wings deployment check', version: '1.0.0' } } }),
  signal: AbortSignal.timeout(20000),
  redirect: 'error',
});
assert.equal(response.status, 401, 'Unauthenticated MCP POST must return 401, not 404/500/HTML');
assert.ok((response.headers.get('www-authenticate') ?? '').includes(origin + '/.well-known/oauth-protected-resource'));
console.log('Passed: MCP POST → 401 with OAuth discovery challenge');
console.log('Live discovery and unauthenticated routing passed; authenticated OAuth still requires a test account.');
