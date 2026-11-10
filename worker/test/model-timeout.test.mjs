import test from 'node:test';
import assert from 'node:assert/strict';
import {streamGemini} from '../src/gemini.js';

const options = {question: 'Why does this code fail?', chunks: [], isCode: true};
const env = {GEMINI_DEEP_MODEL: 'deep', GEMINI_MODEL: 'fast', GEMINI_FAST_MODEL: 'lite', WEB_SEARCH: 'off', MODEL_FIRST_CONTENT_TIMEOUT_MS: 25, MODEL_STREAM_IDLE_TIMEOUT_MS: 25};
const never = () => new Promise(() => {});
const event = (parts) => `data: ${JSON.stringify({candidates: [{content: {parts}}]})}\n\n`;
const answer = () => new Response(event([{text: '===GROUNDED===A small answer.'}]) + 'data: [DONE]\n\n');
const collect = async (opts = {}) => {let text = ''; for await (const delta of streamGemini(env, {...options, ...opts})) text += delta; return text;};
const mock = (t, fetcher) => {const original = globalThis.fetch; globalThis.fetch = fetcher; t.after(() => {globalThis.fetch = original;});};

for (const stalled of ['headers', 'reader']) test(`stalled ${stalled} aborts deep and yields fast answer even if provider ignores abort`, async (t) => {
  const calls = [], signals = []; let cancelled = 0;
  mock(t, async (url, init) => {
    calls.push(url); signals.push(init.signal);
    if (calls.length > 1) return answer();
    if (stalled === 'headers') return never();
    return {ok: true, body: {getReader: () => ({read: never, cancel: () => {cancelled++; return never();}, releaseLock() {}})}};
  });
  assert.match(await collect(), /small answer/);
  assert.equal(calls.length, 2); assert.match(calls[1], /\/fast:/); assert.equal(signals[0].aborted, true);
  if (stalled === 'reader') assert.ok(cancelled > 0);
});

test('all stalled models terminate with error rather than waiting forever', async (t) => {
  let calls = 0; mock(t, () => {calls++; return never();});
  await assert.rejects(collect(), /first-content deadline/); assert.equal(calls, 3);
});

test('thought and whitespace parts do not count as answer content or leak to output', async (t) => {
  let calls = 0;
  mock(t, async () => {
    calls++;
    if (calls === 2) return answer();
    let read = false;
    return {ok: true, body: {getReader: () => ({read: () => {if (read) return never(); read = true; return Promise.resolve({value: new TextEncoder().encode(event([{thought: true, text: 'secret thinking'}, {text: '  '}]))});}, cancel() {}, releaseLock() {}})}};
  });
  const output = await collect(); assert.match(output, /small answer/); assert.doesNotMatch(output, /secret/); assert.equal(calls, 2);
});

test('partial output followed by a stall fails without duplicate fallback text', async (t) => {
  let calls = 0, read = false, cancelled = false;
  mock(t, async () => {calls++; return {ok: true, body: {getReader: () => ({read: () => {if (read) return never(); read = true; return Promise.resolve({value: new TextEncoder().encode(event([{text: 'partial'}]))});}, cancel() {cancelled = true;}, releaseLock() {}})}};});
  const iterator = streamGemini(env, options);
  assert.equal((await iterator.next()).value, 'partial');
  await assert.rejects(iterator.next(), /stream stalled/); assert.equal(calls, 1); assert.equal(cancelled, true);
});

test('caller signal cancels a stuck reader without trying another model', async (t) => {
  const controller = new AbortController(); let calls = 0, cancelled = false;
  mock(t, async () => {calls++; return {ok: true, body: {getReader: () => ({read: never, cancel() {cancelled = true;}, releaseLock() {}})}};});
  const pending = collect({signal: controller.signal});
  setTimeout(() => controller.abort(new Error('caller cancelled')), 5);
  await assert.rejects(pending, /caller cancelled/); assert.equal(calls, 1); assert.equal(cancelled, true);
});

test('breaking consumption cancels reader and cleans deadline', async (t) => {
  let cancelled = false; let providerSignal;
  mock(t, async (_url, init) => {providerSignal = init.signal; return {ok: true, body: {getReader: () => ({read: async () => ({value: new TextEncoder().encode(event([{text: 'first'}, {text: 'second'}]))}), cancel() {cancelled = true;}, releaseLock() {}})}};});
  for await (const text of streamGemini(env, options)) {assert.equal(text, 'first'); break;}
  assert.equal(cancelled, true); assert.equal(providerSignal.aborted, true);
});

test('normal completion filters thoughts and parses final SSE line without newline', async (t) => {
  let calls = 0; mock(t, async () => {calls++; return new Response(event([{thought: true, text: 'hidden'}, {text: 'visible'}]).trim());});
  assert.equal(await collect(), 'visible'); assert.equal(calls, 1);
});

test('billing quota fallback preserves fast then lite model order', async (t) => {
  const calls = []; mock(t, async (url) => {calls.push(url); return calls.length < 3 ? new Response('billing quota exceeded', {status: 429}) : answer();});
  assert.match(await collect(), /small answer/); assert.equal(calls.length, 3);
  assert.match(calls[0], /\/deep:/); assert.match(calls[1], /\/fast:/); assert.match(calls[2], /\/lite:/);
});

test('deadline wins over a real stream AbortError so fast fallback still runs', async (t) => {
  let calls = 0, aborted = false;
  mock(t, async (_url, init) => {
    calls++;
    if (calls > 1) return answer();
    return new Response(new ReadableStream({start(controller) {
      init.signal.addEventListener('abort', () => {
        aborted = true;
        controller.error(new DOMException('Provider aborted', 'AbortError'));
      }, {once: true});
    }}));
  });
  assert.match(await collect(), /small answer/);
  assert.equal(aborted, true); assert.equal(calls, 2);
});

test('post-answer thought and usage heartbeats do not extend the content idle deadline', async (t) => {
  let calls = 0, frames = 0, interval, cancelled = false;
  t.after(() => clearInterval(interval));
  mock(t, async () => {
    calls++;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(event([{text: 'partial'}])));
        interval = setInterval(() => {
          frames++;
          controller.enqueue(new TextEncoder().encode(event([{thought: true, text: 'internal'}, {text: ' '}]) + 'data: {"usageMetadata":{"totalTokenCount":10}}\n\n'));
        }, 4);
      },
      cancel() {cancelled = true; clearInterval(interval);},
    }));
  });
  const iterator = streamGemini(env, options);
  assert.equal((await iterator.next()).value, 'partial');
  // Whitespace may be yielded after answer text, but cannot refresh the deadline.
  await assert.rejects(async () => {for await (const text of iterator) assert.equal(text.trim(), '');}, /stream stalled/);
  assert.ok(frames >= 2); assert.equal(calls, 1); assert.equal(cancelled, true);
});
