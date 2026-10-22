import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './asyncControl' && context.parentURL?.endsWith('/backend.ts')) return { url: new URL('../src/services/asyncControl.ts', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { BackendClient } = await import('../src/services/backend.ts');
const client = () => new BackendClient({ baseUrl: 'https://example.test', getSession: () => null, saveSession: async () => {} });

test('backend times out even when headers arrive but the response body hangs', async () => {
  let signal;
  globalThis.fetch = async (_url, init) => { signal = init.signal; return { text: () => new Promise(() => {}) }; };
  await assert.rejects(client().request('/test', {}, { auth: false, timeoutMs: 10, queue: false }), error => error.code === 'NETWORK_TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('malformed successful responses report an error instead of empty data', async () => {
  globalThis.fetch = async () => new Response('<html>Bad gateway</html>', { status: 200 });
  await assert.rejects(client().request('/test', {}, { auth: false }), error => error.code === 'INVALID_RESPONSE');
});

test('JSON responses and empty successful responses remain compatible', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, data: { value: 1 } }), { status: 200 });
  assert.deepEqual(await client().request('/test', {}, { auth: false }), { value: 1 });
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.deepEqual(await client().request('/test', {}, { auth: false }), {});
});

test('non-JSON error bodies preserve the HTTP status', async () => {
  globalThis.fetch = async () => new Response('Forbidden', { status: 403 });
  await assert.rejects(client().request('/test', {}, { auth: false }), error => error.status === 403);
});
