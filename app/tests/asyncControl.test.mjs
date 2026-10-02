import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventListeners } from 'node:events';
import { abortableDelay, readWithDeadline } from '../src/services/asyncControl.ts';

test('backoff cancellation resolves immediately and removes its listener', async () => {
  const controller = new AbortController();
  const delay = abortableDelay(60_000, controller.signal);
  controller.abort(); await delay;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('backoff completion and already-cancelled delays do not leave listeners', async () => {
  const controller = new AbortController();
  await abortableDelay(0, controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  controller.abort(); await abortableDelay(60_000, controller.signal);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('stream reads stop when the user cancels even if the server never finishes', async () => {
  const controller = new AbortController();
  const reading = readWithDeadline(() => new Promise(() => {}), controller.signal, 60_000);
  controller.abort();
  await assert.rejects(reading, /중지/);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('stalled streams time out and successful reads clean up', async () => {
  const controller = new AbortController();
  await assert.rejects(readWithDeadline(() => new Promise(() => {}), controller.signal, 10), /끊겼어요/);
  assert.deepEqual(await readWithDeadline(async () => ({ done: false, value: 'hello' }), controller.signal, 60_000), { done: false, value: 'hello' });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});
