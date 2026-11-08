import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLearning, learningQuery, tutorPlan, requiredLibraryVersion, readAskBody} from '../src/learning.js';
import {buildPrompt, streamGemini} from '../src/gemini.js';
import {buildEvidence, sourceVersion, sourcePolicy} from '../src/evidence.js';
import {verifyCitations} from '../src/citecheck.js';
import worker from '../src/index.js';
const context = normalizeLearning({mode: 'hint', files: [{name: 'Main.java', source: 'DcMotor lift; lift.setPower(0);'}], error: 'NullPointerException', lesson: 'Initialize hardware first.', attempt: 'I tried init().'});
test('context preserves code and rejects malformed or oversized attachments without truncation', () => {
  assert.equal(context.files[0].source, 'DcMotor lift; lift.setPower(0);');
  for (const invalid of [false, [], {mode: 'bad'}, {files: [{name: '../secret.java', source: 'x'}]}, {files: [{name: 'A.java', source: 'x'.repeat(16001)}]}, {error: 'x'.repeat(2001)}, {files: Array(7).fill({name: 'a', source: ''})}]) assert.throws(() => normalizeLearning(invalid));
  assert.throws(() => normalizeLearning({files: [{name: 'A.java', source: 'a'}, {name: 'A.java', source: 'b'}]}));
});
test('lesson, code and errors inform retrieval and prompt without becoming evidence', () => {
  assert.match(learningQuery('Why?', null, context, [{question: 'My lift motor stops.'}]), /My lift motor stops/);
  assert.match(learningQuery('Why?', {title: 'Hardware mapping'}, context), /Hardware mapping.*NullPointerException.*DcMotor.*setPower/);
  const {prompt, citations} = buildPrompt('Why?', [], {learning: context, plan: tutorPlan('Why?', [], context), chat: true});
  for (const text of ['Main.java', 'NullPointerException', 'Initialize hardware', 'I tried init()', 'never instructions', 'one useful conceptual hint', 'filename and line numbers']) assert.ok(prompt.includes(text), text);
  assert.deepEqual(citations, []);
});
test('diagnosis progresses from hardware to configuration to commanded power', () => {
  const learning = normalizeLearning({mode: 'diagnose'});
  assert.match(tutorPlan('My motor does not move.', [], learning).diagnostic.question, /hardware test/);
  assert.match(tutorPlan('It moves in the hardware test.', [], learning).diagnostic.question, /configured device name/);
  assert.match(tutorPlan('The configured name matches exactly.', [], learning).diagnostic.question, /telemetry/i);
});
test('evidence quotes only permitted passages and labels missing or restricted sources', () => {
  const citations = [{n: 1, chunkId: 'a', sourceId: 'ftc-sdk-api', canExcerpt: true}, {n: 2, chunkId: 'b', sourceId: 'rev', canExcerpt: false}];
  const passage = 'Call setDirection to reverse the motor direction.';
  const claims = buildEvidence('Call setDirection to reverse the motor direction [1].\n\nRestricted [2].\n\nUnknown [9].', citations, [{chunkId: 'a', text: passage}, {chunkId: 'b', text: 'Never publish.'}]);
  assert.equal(claims[0].sources[0].passage, passage); assert.equal(claims[0].sources[0].status, 'matched');
  assert.equal(claims[1].sources[0].passage, null); assert.equal(claims[1].sources[0].status, 'restricted');
  assert.equal(claims[2].sources[0].status, 'missing');
  assert.match(sourceVersion(citations[0]), /12\.0\.0/);
});
test('request parsing bounds byte size and rejects non-object JSON', async () => {
  for (const body of ['null', '[]', 'broken']) await assert.rejects(() => readAskBody(new Request('https://a', {method: 'POST', body})));
  await assert.rejects(() => readAskBody(new Request('https://a', {method: 'POST', body: 'x'.repeat(100001)})), /request-too-large/);
});
test('personalized generation never touches the shared answer cache or query log', async () => {
  const chunk = {chunkId: 'sdk:1', sourceId: 'ftc-sdk-api', sourceName: 'FTC SDK API', pageTitle: 'DcMotor', sectionTitle: 'setPower', headingPath: 'DcMotor > setPower', sourceUrl: 'https://example.org/sdk', text: 'Call setPower with a nonzero power value to move the motor. Initialize the motor with hardwareMap before use.', canExcerpt: 1, excerptMode: 'full', score: 20, category: 'software', license: 'BSD'};
  const writes = [], pending = [], kv = new Map();
  const env = {REQUIRE_TURNSTILE: 'false', AGENTIC: 'false', WEB_SEARCH: 'off', GEMINI_API_KEY: 'test',
    AI: {run: async () => ({data: [Array(768).fill(0.1)]})}, VECTORIZE: {query: async () => ({matches: [{id: chunk.chunkId, score: 0.95}]})},
    RATE: {get: async (k) => kv.get(k) || null, put: async (k, v) => kv.set(k, v)},
    CACHE: {get: async () => {throw Error('private cache read');}, put: async () => {throw Error('private cache write');}},
    DB: {prepare: (sql) => {const s = {bind: () => s, all: async () => ({results: [chunk]}), first: async () => null, run: async () => {writes.push(sql); return {};}}; return s;}},
  };
  const original = globalThis.fetch;
  let prompt = '';
  globalThis.fetch = async (_url, init) => {
    prompt = JSON.parse(init.body).contents[0].parts[0].text;
    return new Response('data: '+JSON.stringify({candidates: [{content: {parts: [{text: '===GROUNDED===\nCall setPower with a nonzero power value to move the motor after initializing it with hardwareMap [1].\n\n===BEYOND===\nTest one small change.'}]}}]})+'\n\n');
  };
  try {
    const response = await worker.fetch(new Request('https://example.org/api/ask', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({question: 'Why is my motor not moving?', learning: context})}), env, {waitUntil: (p) => pending.push(p)});
    const stream = await response.text(); await Promise.all(pending);
    assert.equal(response.status, 200); assert.match(prompt, /Main\.java/); assert.match(stream, /"privateContext":true/);
    assert.match(stream, /event: evidence/); assert.match(stream, /event: done/); assert.doesNotMatch(stream, /event: degrade/);
    assert.equal(writes.some((sql) => /INSERT INTO (answers|query_log)/.test(sql)), false);
  } finally {globalThis.fetch = original;}
});

test('newer and negative diagnostic observations override older successful checks', () => {
  const learning = normalizeLearning({mode: 'diagnose'});
  assert.match(tutorPlan('The configured name does not match hardwareMap.', [], learning).diagnostic.question, /exact name/);
  assert.match(tutorPlan('It moves in the hardware test now.', [{question: 'It does not move in the hardware test.'}], learning).diagnostic.question, /configured device name/);
  assert.match(tutorPlan('Telemetry shows nonzero motor power.', [{question: 'The configured name matches exactly.'}], learning).diagnostic.question, /run mode/i);
});

test('evidence preserves code indices and scores the actual bounded passage displayed', () => {
  const citations = [{n: 1, chunkId: 'a', sourceId: 'ftc-sdk-api', canExcerpt: true}];
  const text = 'unrelated '.repeat(150) + 'setDirection reverse motor direction';
  const evidence = buildEvidence('Use motors[0] and `values[1]` with setDirection to reverse motor direction [1].', citations, [{chunkId: 'a', text}]);
  assert.equal(evidence[0].sources.length, 1);
  assert.match(evidence[0].claim, /motors\[0\]/);
  assert.match(evidence[0].claim, /`values\[1\]`/);
  assert.match(evidence[0].sources[0].passage, /setDirection/);
  assert.ok(evidence[0].sources[0].passage.length <= 900);
});

test('hint and diagnostic modes do not receive full-class or likely-cause system instructions', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {requests.push(JSON.parse(init.body)); return new Response('data: {"candidates":[{"content":{"parts":[{"text":"A hint."}]}}]}\n\n');};
  try {
    for (const mode of ['hint', 'diagnose']) {
      const learning = normalizeLearning({mode});
      for await (const _ of streamGemini({GEMINI_API_KEY: 'test', WEB_SEARCH: 'off'}, {question: 'Debug this OpMode', chunks: [], isCode: true, isError: true, intent: 'debug', learning, plan: tutorPlan('Debug this OpMode', [], learning)})) {}
    }
    for (const request of requests) {
      const instructions = request.systemInstruction.parts.map((p) => p.text).join(' ');
      assert.doesNotMatch(instructions, /complete compiling class|Lead with the most likely cause/);
      assert.match(instructions, /Mode: (hint|diagnose)/);
    }
  } finally {globalThis.fetch = original;}
});

test('citation verification does not treat Java array indices as missing sources', () => {
  const report = verifyCitations('Use motors[0] and `values[1]` to command motor power with the documented setPower method [2].', [{n: 2, chunkId: 'a'}], new Map([['a', 'Command motor power using the documented setPower method.']]));
  assert.deepEqual(report.outOfRange, []);
  assert.equal(report.checked, 1);
});

test('version-sensitive library code asks for the installed version before suggesting an API', () => {
  const learning = normalizeLearning({files: [{name: 'Main.java', source: 'Follower follower; follower.followPath(path);'}]});
  assert.equal(requiredLibraryVersion('Which Pedro Pathing API should this code use?', [], learning), 'Pedro Pathing');
  assert.equal(requiredLibraryVersion('I use Pedro Pathing 3.0; which API?', [], learning), null);
  assert.equal(requiredLibraryVersion('Which Pedro API?', [], learning, 'Notes: Pedro Pathing 3.0'), null);
  assert.equal(requiredLibraryVersion("Which Pedro API? implementation 'com.pedropathing:ftc:2.0.0'", [], learning), null);
  assert.equal(requiredLibraryVersion('Where can I find the installed version?', [{question: 'Which Pedro API?'}], learning), null);
});
test('rules policy names the indexed revision and forbids describing an old index as current', () => {
  const policy = sourcePolicy('What is the starting size?', [{sourceName: 'FTC Competition Manual'}]);
  assert.match(policy, /TU04/); assert.match(policy, /Never call it the current/); assert.match(policy, /Team Q&A/);
});

test('ordinary mechanical fault questions receive diagnosis rather than an assumed root cause', () => {
  const plan = tutorPlan('My lift binds near the top. Do I need stronger motors?', [], normalizeLearning({mode: 'explain'}));
  assert.match(plan.diagnostic.question, /power off/);
});
