/**
 * The relevance gate and the pieces feeding it.
 *
 * These are the functions that decide whether a question gets an answer at
 * all, and until now nothing checked them except the ingest eval — which runs
 * locally, needs the whole corpus embedded, and takes the better part of an
 * hour. That is the right tool for "did retrieval quality regress" and the
 * wrong one for "did someone invert a comparison". The numbers asserted here
 * are the real measurements from that eval on 2026-09-12, so if a threshold is
 * edited these fail with the case that motivated it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passesRelevanceGate, DEFAULT_THRESHOLDS, fuse } from '../src/lib/fusion.js';
import { buildFtsQuery, termCoverage, tokenize } from '../src/lib/query.js';
import { normalizeQuestion, questionSlug } from '../src/lib/slug.js';
import { readUsage } from '../src/lib/tokens.js';

// Measured by ingest/src/eval.js on 2026-09-12. On-topic must pass, off-topic
// must not, and the margin is thin enough to be worth pinning: the best
// off-topic cosine was 0.558 against a 0.60 threshold.
//
// Every row below is a real (cosine, bm25) pair from one question. An earlier
// draft of this file combined the eval's reported minimum cosine with its
// reported minimum BM25 — but those minima came from two different questions,
// so the row described a retrieval that never happened, and it failed. Do not
// synthesise rows here; take them from an eval run.
const ON_TOPIC = [
  ['3d printing', { bestCosine: 0.724, bestBm25: 21.95, overlap: 5, coverage: 1.0 }],
  ['custom part material', { bestCosine: 0.714, bestBm25: 13.61, overlap: 1, coverage: 1.0 }],
  // Real pair, not a constructed one: "what is an X drive and when would I use
  // one" scored the LOWEST BM25 of any on-topic question (5.30, well under the
  // 8.0 bar) and is admitted purely on its embedding. This is the case that
  // justifies having a semantic-only path at all.
  ['X drive, low bm25', { bestCosine: 0.649, bestBm25: 5.30, overlap: 1, coverage: 0.8 }],
  ['strafing', { bestCosine: 0.630, bestBm25: 10.19, overlap: 1, coverage: 1.0 }],
];
const OFF_TOPIC = [
  ['sourdough', { bestCosine: 0.558, bestBm25: 7.60, overlap: 0, coverage: 0.67 }],
  // High BM25 is NOT sufficient: this scored 14.04, well over the 8.0 bar, and
  // must still be refused because nothing corroborates it.
  ['prompt injection', { bestCosine: 0.510, bestBm25: 14.04, overlap: 0, coverage: 0.75 }],
  ['capital of France', { bestCosine: 0.457, bestBm25: 7.84, overlap: 0, coverage: 0.50 }],
  ['Hamlet', { bestCosine: 0.519, bestBm25: 5.33, overlap: 0, coverage: 0.50 }],
];

test('gate admits every on-topic question from the eval', () => {
  for (const [name, m] of ON_TOPIC) {
    assert.equal(passesRelevanceGate(m).pass, true, `${name} should pass`);
  }
});

test('gate refuses every off-topic probe from the eval', () => {
  for (const [name, m] of OFF_TOPIC) {
    assert.equal(passesRelevanceGate(m).pass, false, `${name} should be refused`);
  }
});

test('a strong BM25 alone cannot open the gate', () => {
  // The corroborated path needs overlap AND coverage, not just a keyword hit.
  const bm25Only = { bestCosine: 0.50, bestBm25: 40, overlap: 0, coverage: 0.9 };
  assert.equal(passesRelevanceGate(bm25Only).pass, false);
});

test('a confident embedding alone does open it', () => {
  const semanticOnly = { bestCosine: DEFAULT_THRESHOLDS.minCosine, bestBm25: 0, overlap: 0, coverage: 0 };
  assert.equal(passesRelevanceGate(semanticOnly).pass, true);
});

test('missing signals are treated as zero, not as NaN', () => {
  // An empty retrieval must refuse rather than compare undefined and let it
  // through by accident.
  assert.equal(passesRelevanceGate({}).pass, false);
  assert.equal(passesRelevanceGate({ bestCosine: null, bestBm25: null }).pass, false);
});

test('fusion ranks a chunk both retrievers found above one only seen by either', () => {
  const both = fuse({
    keyword: [{ chunkId: 'agreed' }, { chunkId: 'kw-only' }],
    semantic: [{ chunkId: 'sem-only' }, { chunkId: 'agreed' }],
  }, 3);
  assert.equal(both.results[0].chunkId, 'agreed');
});

test('an FTS query never contains bare punctuation that would break SQLite', () => {
  for (const q of ['what is R102?', 'mecanum "X" or O', "don't brown out", 'C++ / Java']) {
    const fts = buildFtsQuery(q);
    assert.doesNotMatch(fts, /""|\(\)/, `degenerate token from: ${q}`);
  }
});

test('term coverage measures the question against what came back', () => {
  assert.equal(termCoverage('odometry pods', ['mounting odometry pods rigidly']), 1);
  assert.equal(termCoverage('odometry pods', ['unrelated text entirely']), 0);
});

test('questions differing only in punctuation and case share a cache identity', () => {
  const a = normalizeQuestion('What is R102?');
  const b = normalizeQuestion('what is   r102');
  assert.equal(a, b);
});

test('a slug is url-safe and stable', () => {
  const s = questionSlug('How do you score points in BIOBUZZ?', 'abc123def456');
  assert.match(s, /^[a-z0-9-]+$/);
  assert.equal(s, questionSlug('How do you score points in BIOBUZZ?', 'abc123def456'));
});

test('usage parsing survives the fields Gemini omits', () => {
  // Field names differ between models and some are absent; a missing one must
  // not turn the whole row into NaN.
  assert.equal(readUsage(null), null);
  assert.equal(readUsage({}), null);
  const u = readUsage({ promptTokenCount: 100, candidatesTokenCount: 20 });
  assert.equal(u.total, 120);
  assert.equal(u.thoughts, 0);
  const t = readUsage({ promptTokenCount: 10, toolUsePromptTokenCount: 5, totalTokenCount: 99 });
  assert.equal(t.prompt, 15);
  assert.equal(t.total, 99);
});
