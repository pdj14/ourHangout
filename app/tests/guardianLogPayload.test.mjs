import assert from 'node:assert/strict';
import test from 'node:test';
import { guardianLogBatches, utf8Length } from '../src/services/guardianLogPayload.ts';

test('UTF-8 budgets account for Korean and emoji', () => {
  assert.equal(utf8Length('안녕😀'), Buffer.byteLength('안녕😀'));
});

test('merge batches preserve full long answers and every message', () => {
  const input = Array.from({ length: 10 }, (_, i) => ({ id: String(i), role: 'assistant', content: '긴 답변 '.repeat(2000), createdAt: i + 1 }));
  const envelope = { roomId: 'room', clientLogId: 'log', mode: 'merge' };
  const batches = guardianLogBatches(input, 100000, 80000, envelope, true);
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat().map(message => message.content), input.map(message => message.content));
  for (const batch of batches) assert.ok(Buffer.byteLength(JSON.stringify({ ...envelope, messages: batch })) <= 80000);
});

test('legacy payloads fit the body limit and label actual truncation', () => {
  const result = guardianLogBatches([{ id: 'a', role: 'assistant', content: 'x'.repeat(9000), createdAt: 1 }], 4000, 800000, {}, false);
  assert.equal(result[0][0].content.length, 4000);
  assert.equal(result[0][0].truncated, true);
});
