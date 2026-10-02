import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

globalThis.__aiFetch = (...args) => fetch(...args);
globalThis.__aiCredential = async () => 'test-key';
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'expo/fetch') return { url: moduleUrl('export const fetch = (...args) => globalThis.__aiFetch(...args);'), shortCircuit: true };
    if (specifier === './credentials' && context.parentURL?.endsWith('openAiCompatibleTransport.ts')) return { url: moduleUrl('export const getProviderApiKey = (...args) => globalThis.__aiCredential(...args);'), shortCircuit: true };
    if (specifier === './adapters' && context.parentURL?.endsWith('openAiCompatibleTransport.ts')) return { url: moduleUrl('export const getOpenAiProviderWireAdapter = () => ({buildHeaders:()=>({}), requestExtensions:()=>({}),modelsQuery:"",isFreeModel:()=>false});'), shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.ts')) return { format: 'module', source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform' }), shortCircuit: true };
    return next(url, context);
  },
});
const { streamOpenAiCompatibleConversation, cancelOpenAiCompatibleCompletion } = await import('../src/services/aiProviders/openAiCompatibleTransport.ts');
const settings = { providerId: 'openRouter', baseUrl: 'https://example.test/v1', modelId: 'test-model' };
const messages = [{ role: 'user', content: 'hello' }];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const encoder = new TextEncoder();

test('cancelling during credential lookup prevents the later network request', async () => {
  const gate = deferred(); let fetched = false;
  globalThis.__aiCredential = () => gate.promise;
  globalThis.__aiFetch = async () => { fetched = true; throw new Error('must not fetch'); };
  const completion = streamOpenAiCompatibleConversation(settings, messages, 'system', { onPartial() {} });
  cancelOpenAiCompatibleCompletion(); gate.resolve('test-key');
  await assert.rejects(completion, error => error.code === 'cancelled');
  assert.equal(fetched, false);
  globalThis.__aiCredential = async () => 'test-key';
});

test('cancelling after response headers aborts transport and closes a stalled reader', async () => {
  const started = deferred(); let fetchSignal; let cancelled = false;
  globalThis.__aiFetch = async (_url, init) => {
    fetchSignal = init.signal;
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n')); },
      cancel() { cancelled = true; },
    }), { headers: { 'content-type': 'text/event-stream' } });
  };
  const completion = streamOpenAiCompatibleConversation(settings, messages, 'system', { onPartial: () => started.resolve() });
  await started.promise; cancelOpenAiCompatibleCompletion();
  await assert.rejects(completion, error => error.code === 'cancelled');
  assert.equal(fetchSignal.aborted, true);
  assert.equal(cancelled, true);
});

test('a healthy streamed response flushes its final partial and releases the reader', async () => {
  const partials = [];
  globalThis.__aiFetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello "}}]}\n\n'));
    controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
  const result = await streamOpenAiCompatibleConversation(settings, messages, 'system', { onPartial: value => partials.push(value) });
  assert.equal(result.content, 'hello world');
  assert.equal(partials.at(-1), 'hello world');
});
