import assert from 'node:assert/strict';
import test from 'node:test';
import { loadChunks, meta } from '../src/sources/telemark-fll.js';

test('Telemark FLL export maps to unique, excerptable index sections', () => {
  const chunks = loadChunks();
  assert.equal(meta.sourceId, 'telemark-fll');
  assert.equal(chunks.length, 397);
  assert.equal(new Set(chunks.map((c) => c.docPath)).size, chunks.length);
  assert.equal(new Set(chunks.map((c) => c.sourceUrl)).size, 82);
  assert.ok(chunks.every((c) => c.sourceUrl.startsWith('https://telemarkfirst.github.io/fll/')));
  assert.ok(chunks.every((c) => c.canExcerpt === 1 && c.excerptMode === 'full'));
  assert.ok(chunks.every((c) => c.text.startsWith(`# ${c.pageTitle}\n## ${c.sectionTitle}\n\n`)));
  assert.ok(chunks.every((c) => !/<(?:FllPythonPractice|MarkComplete)\b/.test(c.text)));
  const byPage = new Map();
  for (const chunk of chunks) {
    const next = byPage.get(chunk.sourceUrl) || 0;
    assert.equal(chunk.ordinal, next);
    byPage.set(chunk.sourceUrl, next + 1);
  }
});
