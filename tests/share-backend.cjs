const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('supabase/functions/tracking-lists/index.ts', 'utf8');
const schema = fs.readFileSync('supabase/functions/tracking-lists/schema.sql', 'utf8');
assert.match(source, /MAX_BODY_BYTES = 16 \* 1024/);
assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(schema, /revoke all on table private\.tracking_lists from public, anon, authenticated/);
assert.match(schema, /grant execute on function public\.tracking_list_access[\s\S]*to service_role/);
assert.doesNotMatch(schema, /create or replace function private\.tracking_list_access/);
assert.match(schema, /security invoker/);
assert.match(schema, /set search_path = pg_catalog, private/);

const context = vm.createContext({
  console, TextEncoder, TextDecoder, Uint8Array, Headers, Request, Response,
  crypto: globalThis.crypto, fetch: globalThis.fetch, setTimeout,
});
vm.runInContext(source.replace('export const createHandler =', 'globalThis.createHandler ='), context);

const requests = [];
const rpcFetch = async (url, init) => {
  assert.match(url, /\/rest\/v1\/rpc\/tracking_list_access$/);
  assert.doesNotMatch(url, /\/private\//);
  requests.push({ url, init, body: JSON.parse(init.body) });
  const action = requests.at(-1).body.p_action;
  const payload = action === 'revoke'
    ? { ok: true }
    : { eventId: 'myresult-176', bibs: ['3909'], names: {3909: '김현일'}, expiresAt: '2099-01-01T00:00:00Z' };
  return new Response(JSON.stringify(payload), { status: 200, headers: {'content-type': 'application/json'} });
};
const handler = context.createHandler({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only' }, rpcFetch);

(async () => {
  const create = await handler(new Request('https://example.test/functions/v1/tracking-lists', {
    method: 'POST', body: JSON.stringify({ action: 'create', eventId: '176', bibs: ['3909'], names: {3909: '김현일'} }),
  }));
  assert.equal(create.status, 200);
  const created = await create.json();
  assert.match(created.token, /^[0-9a-f]{64}$/);
  assert.match(created.editToken, /^[0-9a-f]{64}$/);
  assert.equal(requests[0].body.p_read_hash.length, 64);
  assert.equal(requests[0].body.p_edit_hash.length, 64);
  assert.notEqual(requests[0].body.p_read_hash, created.token);

  const read = await handler(new Request('https://example.test/functions/v1/tracking-lists', {
    method: 'POST', body: JSON.stringify({ action: 'read', token: created.token }),
  }));
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), { eventId: 'myresult-176', bibs: ['3909'], names: {3909: '김현일'}, expiresAt: '2099-01-01T00:00:00Z' });

  const emptyUpdate = await handler(new Request('https://example.test/functions/v1/tracking-lists', {
    method: 'POST', body: JSON.stringify({ action: 'update', editToken: created.editToken, eventId: 'myresult-176', bibs: [], names: {} }),
  }));
  assert.equal(emptyUpdate.status, 200);
  assert.equal(requests.at(-1).body.p_bibs.length, 0);

  const partialUpdate = await handler(new Request('https://example.test/functions/v1/tracking-lists', {
    method: 'POST', body: JSON.stringify({ action: 'update', editToken: created.editToken, names: {} }),
  }));
  assert.equal(partialUpdate.status, 400);

  const oversized = await handler(new Request('https://example.test/functions/v1/tracking-lists', {
    method: 'POST', body: 'x'.repeat(16 * 1024 + 1), headers: {'content-type': 'application/json'},
  }));
  assert.equal(oversized.status, 400);

  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(16 * 1024 + 1)));
      controller.close();
    },
  });
  const streamed = await handler(new Request('https://example.test/functions/v1/tracking-lists', {
    method: 'POST', body: oversizedStream, duplex: 'half', headers: {'content-length': '1'},
  }));
  assert.equal(streamed.status, 400);

  const invalid = await handler(new Request('https://example.test/functions/v1/tracking-lists', {
    method: 'POST', body: JSON.stringify({ action: 'read', token: 'short' }),
  }));
  assert.equal(invalid.status, 400);
  console.log('PASS: tracking-lists validates, hashes, persists, updates empty lists, and never sends raw tokens to RPC');
})().catch((error) => { console.error(error); process.exitCode = 1; });
