import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';

// Exercise the hook's event handlers and scheduled work without a native renderer.
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/useChatKeyboard.ts')) {
      if (specifier === 'react') return { shortCircuit: true, url: moduleUrl(`
        export const useRef = current => ({ current });
        export const useCallback = callback => callback;
        export const useState = initial => [initial, () => {}];
        export const useEffect = effect => { const cleanup = effect(); if (cleanup) globalThis.__chatScrollTest.cleanups.push(cleanup); };
      `) };
      if (specifier === 'react-native') return { shortCircuit: true, url: moduleUrl(`
        export class FlatList {}
        export const Platform = { OS: 'android' };
        export const Keyboard = { addListener(name, callback) {
          globalThis.__chatScrollTest.listeners.set(name, callback);
          return { remove() { globalThis.__chatScrollTest.listeners.delete(name); } };
        } };
      `) };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/useChatKeyboard.ts')) return { shortCircuit: true, format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }) };
    return next(url, context);
  },
});
const { useChatKeyboard } = await import('../src/hooks/useChatKeyboard.ts');
const originalRequestFrame = globalThis.requestAnimationFrame;
const originalCancelFrame = globalThis.cancelAnimationFrame;
let frames;
beforeEach(() => {
  frames = new Map();
  let frameId = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.__chatScrollTest = { cleanups: [], listeners: new Map() };
});
afterEach(() => {
  globalThis.__chatScrollTest.cleanups.forEach(cleanup => cleanup());
  globalThis.requestAnimationFrame = originalRequestFrame;
  globalThis.cancelAnimationFrame = originalCancelFrame;
  delete globalThis.__chatScrollTest;
});
const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
const scrollEvent = (distanceFromEnd, height = 1800) => ({ nativeEvent: {
  contentSize: { width: 360, height }, layoutMeasurement: { width: 360, height: 600 }, contentOffset: { x: 0, y: height - 600 - distanceFromEnd },
} });
function setup() {
  const calls = [];
  const nearBottomRef = { current: true };
  const hook = useChatKeyboard({ current: { scrollToEnd: options => calls.push(options) } }, { nearBottomRef });
  return { ...hook, calls };
}

test('dragging cancels pending keyboard timers and animation frames immediately', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const hook = setup();
  hook.scheduleScrollToLatest();
  context.mock.timers.tick(0);
  hook.handleScrollBeginDrag();
  context.mock.timers.tick(1000);
  flushFrames();
  assert.equal(hook.nearBottomRef.current, false);
  assert.deepEqual(hook.calls, []);
});

test('a small upward drag stays detached even inside the normal bottom tolerance', () => {
  const hook = setup();
  hook.handleScrollBeginDrag();
  hook.handleScroll(scrollEvent(40));
  hook.handleScrollEndDrag(scrollEvent(40));
  hook.scrollToLatest();
  flushFrames();
  assert.equal(hook.nearBottomRef.current, false);
  assert.deepEqual(hook.calls, []);
});

test('late content and layout events cannot scroll while the finger is dragging', () => {
  const hook = setup();
  hook.handleScrollBeginDrag();
  hook.handleScroll(scrollEvent(0));
  hook.scrollToLatest();
  flushFrames();
  assert.deepEqual(hook.calls, []);
});

test('AI completion and keyboard focus preserve the position while reading history', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const hook = setup();
  hook.handleScrollBeginDrag();
  hook.handleScrollEndDrag(scrollEvent(800));
  hook.handleComposerFocus();
  globalThis.__chatScrollTest.listeners.get('keyboardDidShow')();
  hook.scheduleScrollToLatest();
  context.mock.timers.tick(1000);
  flushFrames();
  assert.deepEqual(hook.calls, []);
});

test('returning to the bottom resumes following incoming messages', () => {
  const hook = setup();
  hook.handleScrollBeginDrag();
  hook.handleScrollEndDrag(scrollEvent(400));
  hook.handleScroll(scrollEvent(0));
  hook.scrollToLatest();
  flushFrames();
  assert.equal(hook.nearBottomRef.current, true);
  assert.equal(hook.calls.length, 1);
});

test('a pending frame checks the latest scroll intent before touching the list', () => {
  const hook = setup();
  hook.scrollToLatest();
  hook.nearBottomRef.current = false;
  flushFrames();
  assert.deepEqual(hook.calls, []);
});

test('new conversation or send can explicitly resume following after a drag', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const hook = setup();
  hook.handleScrollBeginDrag();
  hook.handleScrollEndDrag(scrollEvent(400));
  hook.nearBottomRef.current = true;
  hook.scheduleScrollToLatest();
  context.mock.timers.tick(360);
  flushFrames();
  assert.equal(hook.calls.length, 1);
});
