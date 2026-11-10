import {parseCorpus, parseSourceResults} from '../src/lib/source-explorer.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/lib/markdown.ts';
import { parseConversations, saveConversations, conversationMarkdown, contextHistory } from '../src/lib/conversations.ts';
import { blankTurn } from '../src/lib/chat-types.ts';
import { parseSseEvent } from '../src/lib/sse.ts';

test('answer tables preserve citations and escape model HTML', () => {
  const html = renderMarkdown('| Part | Note |\n| --- | --- |\n| <script>alert(1)</script> | Use [1] |', 1);
  assert.match(html, /<table>/); assert.match(html, /Jump to source 1/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
});
test('code blocks provide a copy action and preserve Java exactly', () => {
  const html = renderMarkdown('```java\nif (x < 1) motor.setPower(0);\n```\n\nNext paragraph.');
  assert.match(html, /data-copy-code/); assert.match(html, /if \(x &lt; 1\)/);
  assert.match(html, /<p>Next paragraph\.<\/p>/);
});
test('malformed saved conversations and unsafe source URLs cannot restore', () => {
  assert.deepEqual(parseConversations('{broken'), []);
  const raw = JSON.stringify([{ id: 'a', title: 'Robot', turns: [{ question: 'Yaw?', status: 'streaming',
    answer: 'Use resetYaw.', beyond: 'Do not persist me.', citations: [{ n: 1, chunkId: 'c', sourceName: 'Bad', sourceId: 'bad', headingPath: 'Bad', url: 'javascript:alert(1)' }] }] }]);
  const restored = parseConversations(raw)[0].turns[0];
  assert.equal(restored.status, 'stopped'); assert.equal(restored.beyond, ''); assert.equal(restored.citations.length, 0);
});
test('saved history and exported notes contain grounded answers only', () => {
  let stored = '';
  const prior = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (_key, value) => { stored = value; } } });
  const turn = { ...blankTurn(0, 'Yaw?'), status: 'done', answer: 'Use resetYaw.', beyond: 'Unverified reasoning.' };
  try {
    assert.equal(saveConversations([{ id: 'a', title: 'Yaw?', updatedAt: '2026-10-11', turns: [turn] }]), true);
    assert.doesNotMatch(stored, /Unverified reasoning/);
    assert.equal(parseConversations(stored)[0].turns[0].answer, 'Use resetYaw.');
    assert.doesNotMatch(conversationMarkdown([turn]), /Unverified reasoning/);
  } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prior }); }
});
test('SSE handles CRLF and multiline data without accepting malformed JSON', () => {
  assert.deepEqual(parseSseEvent('event: done\r\ndata: {\r\ndata: "slug": null\r\ndata: }\r\n'), { event: 'done', payload: { slug: null } });
  assert.equal(parseSseEvent('event: token\ndata: broken'), null);
});


test('restored evidence cannot expose restricted passages or unsafe source links', () => {
  const source = {n: 1, chunkId: 'c', sourceId: 'manual', sourceName: 'Manual', headingPath: 'Rule', url: 'https://example.org/manual', canExcerpt: false, mode: 'summarize', version: 'TU04'};
  const raw = JSON.stringify([{id: 'a', title: 'Rules', turns: [{question: 'Rule?', answer: 'A claim [1].', status: 'done', citations: [source], evidence: [{claim: 'A claim', sources: [{n: 1, status: 'matched', passage: 'Restricted text'}]}]}]}]);
  const restored = parseConversations(raw)[0].turns[0];
  assert.equal(restored.citations[0].version, 'TU04');
  assert.equal(restored.evidence[0].sources[0].passage, null);
  assert.equal(restored.evidence[0].sources[0].status, 'restricted');
});

test('an uncited hint stays available for in-memory follow-ups while remaining absent from saved notes', () => {
  const turn = {...blankTurn(0, 'Give me a hint.'), status: 'done', beyond: 'What happens when the button is released?'};
  assert.equal(contextHistory([turn])[0].answer, turn.beyond);
  assert.doesNotMatch(conversationMarkdown([turn]), /What happens when the button is released/);
});

test('source browser validates live coverage and never reveals restricted search text', () => {
  assert.equal(parseCorpus({updatedAt:'2026-11-09',sections:2,sources:[]}),null);
  const results=parseSourceResults({source:'first-manual',results:[{chunkId:'a',sourceId:'first-manual',mode:'summarize',canExcerpt:true,text:'Restricted',url:'javascript:bad'}]},'first-manual');
  assert.equal(results[0].text,null);assert.equal(results[0].url,'');
  assert.throws(()=>parseSourceResults({source:'gm0',results:[]},'first-manual'),/selected source/);
});
