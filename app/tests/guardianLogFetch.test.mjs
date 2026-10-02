import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './guardianLogPayload' && context.parentURL?.endsWith('/guardianLogSync.ts')) return { url: new URL('../src/services/guardianLogPayload.ts', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { fetchGuardianConversationLogs } = await import('../src/services/guardianLogSync.ts');

test('guardian log lookup preserves a successful empty history', async () => {
  assert.deepEqual(await fetchGuardianConversationLogs({ request: async () => ({ items: [] }) }, 'child'), []);
});

test('guardian log lookup exposes failures instead of pretending no history exists', async () => {
  await assert.rejects(fetchGuardianConversationLogs({ request: async () => { throw new Error('network error'); } }, 'child'), /network error/);
  await assert.rejects(fetchGuardianConversationLogs({ request: async () => ({}) }, 'child'), /사용 내역/);
});
