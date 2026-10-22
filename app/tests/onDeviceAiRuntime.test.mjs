import assert from 'node:assert/strict';
import test from 'node:test';
import { ExclusiveResource } from '../src/services/exclusiveResource.ts';
import { fitPrompt, modelRuntimePlan } from '../src/services/onDeviceAiPolicy.ts';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const gib = 1024 ** 3;
const capacity = { totalMemoryBytes: 8 * gib, availableMemoryBytes: 3 * gib, lowMemoryThresholdBytes: 128 * 1024 ** 2, lowMemory: false, cpuCount: 8 };

test('model replacements serialize initialization and dispose stale contexts', async () => {
  const gate = deferred(); const started = deferred(); const events = [];
  const runtime = new ExclusiveResource(async x => events.push(`release:${x}`), async () => {});
  const first = runtime.replace(async () => { events.push('load:a'); started.resolve(); await gate.promise; return 'a'; });
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await started.promise;
  const second = runtime.replace(async () => { events.push('load:b'); return 'b'; });
  gate.resolve();
  await Promise.all([rejected, second]);
  assert.equal(runtime.current, 'b');
  assert.deepEqual(events, ['load:a', 'release:a', 'load:b']);
});

test('unloading interrupts generation and waits before releasing native memory', async () => {
  const gate = deferred(); const started = deferred(); const events = [];
  const runtime = new ExclusiveResource(async () => events.push('release'), async () => events.push('stop'));
  await runtime.replace(async () => 'model');
  const generation = runtime.run(async (_model, signal) => { started.resolve(); await gate.promise; assert.equal(signal.aborted, true); events.push('generation:end'); });
  await started.promise;
  const unloading = runtime.replace(null);
  await Promise.resolve();
  assert.equal(events.includes('release'), false);
  assert.equal(runtime.current, null);
  gate.resolve();
  await Promise.all([generation, unloading]);
  assert.deepEqual(events, ['stop', 'generation:end', 'release']);
});

test('duplicate generations are rejected without cancelling the first', async () => {
  const gate = deferred();
  const runtime = new ExclusiveResource(async () => {}, async () => {});
  await runtime.replace(async () => 'model');
  const first = runtime.run(async () => { await gate.promise; return 'answer'; });
  await assert.rejects(runtime.run(async () => 'duplicate'), /이미 답변/);
  gate.resolve(); assert.equal(await first, 'answer');
});

test('a failed load does not poison subsequent loads', async () => {
  const runtime = new ExclusiveResource(async () => {}, async () => {});
  await assert.rejects(runtime.replace(async () => { throw new Error('bad model'); }), /bad model/);
  await runtime.replace(async () => 'valid'); assert.equal(runtime.current, 'valid');
});

test('runtime plans reject memory pressure and oversized models and cap CPU threads', () => {
  assert.throws(() => modelRuntimePlan({ ...capacity, lowMemory: true }, gib), /메모리/);
  assert.throws(() => modelRuntimePlan(capacity, 6 * gib), /너무 커/);
  assert.equal(modelRuntimePlan({ ...capacity, cpuCount: 2 }, gib).threadCount, 1);
  assert.equal(modelRuntimePlan({ ...capacity, availableMemoryBytes: gib }, gib).contextSize, 1024);
});

test('prompt fitting counts system and template tokens and reserves response space', async () => {
  const chat = [{ role: 'system', content: 'rules'.repeat(100) }, { role: 'user', content: 'old'.repeat(300) }, { role: 'assistant', content: 'previous'.repeat(200) }, { role: 'user', content: 'latest question' }];
  const count = async messages => messages.reduce((n, m) => n + m.content.length, 60);
  const fitted = await fitPrompt(chat, 1024, 384, count);
  assert.ok(await count(fitted.messages) + fitted.maxTokens + 32 <= 1024);
  assert.equal(fitted.messages.at(-1).content, 'latest question');
  assert.equal(chat.length, 4);
});

test('prompt fitting retains both ends of an overlong latest question', async () => {
  const chat = [{ role: 'system', content: 'short' }, { role: 'user', content: `START${'x'.repeat(2000)}END` }];
  const fitted = await fitPrompt(chat, 1024, 384, async messages => messages.reduce((n, m) => n + m.content.length, 20));
  assert.ok(fitted.messages.at(-1).content.startsWith('START'));
  assert.ok(fitted.messages.at(-1).content.endsWith('END'));
});

test('prompt fitting checks cancellation around tokenizer awaits', async () => {
  let cancelled = false;
  await assert.rejects(fitPrompt([{ role: 'user', content: 'hi' }], 1024, 256, async () => { cancelled = true; return 2; }, () => { if (cancelled) throw new Error('cancelled'); }), /cancelled/);
});
