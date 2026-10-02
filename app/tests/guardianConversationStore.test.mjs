import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const data = new Map();
let firstWriteGate;
let firstWriteStarted;
let writes = 0;
globalThis.__guardianStorage = {
  getItem: async key => data.get(key) ?? null,
  removeItem: async key => data.delete(key),
  setItem: async (key, value) => {
    writes += 1;
    if (firstWriteGate) { const gate = firstWriteGate; firstWriteGate = null; firstWriteStarted(); await gate; }
    data.set(key, value);
  },
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage') return { url: 'data:text/javascript,export default globalThis.__guardianStorage', shortCircuit: true };
  return next(specifier, context);
} });
const { createGuardianConversationRoom, writeGuardianConversationStore, readGuardianConversationStore, archiveDeletedConversation, readParentArchive } = await import('../src/services/guardianConversationStore.ts');

test('slow earlier saves cannot overwrite a newer conversation', async () => {
  const room = createGuardianConversationRoom([{ id: 'q', role: 'user', content: 'old', createdAt: 1 }]);
  let release;
  firstWriteGate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { firstWriteStarted = resolve; });
  const earlier = writeGuardianConversationStore({ activeConversationId: room.id, conversations: [room] });
  await started;
  const later = writeGuardianConversationStore({ activeConversationId: room.id, conversations: [{ ...room, messages: [{ ...room.messages[0], content: 'new' }] }] });
  assert.equal(writes, 1);
  release(); await Promise.all([earlier, later]);
  const saved = await readGuardianConversationStore();
  assert.equal(saved.conversations[0].messages[0].content, 'new');
});

test('concurrent archives preserve both deleted conversations', async () => {
  const one = createGuardianConversationRoom([{ id: '1', role: 'user', content: 'one', createdAt: 1 }]);
  const two = createGuardianConversationRoom([{ id: '2', role: 'user', content: 'two', createdAt: 2 }]);
  await Promise.all([archiveDeletedConversation(one), archiveDeletedConversation(two)]);
  const archive = await readParentArchive();
  assert.deepEqual(new Set(archive.map(room => room.id)), new Set([one.id, two.id]));
});
