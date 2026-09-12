/**
 * The answer splitter, and the rule-8a gate inside it.
 *
 * This exists because the gate was wrong three separate ways before it was
 * right, and every one of them only showed up when the text arrived in small
 * pieces — which is the only way it ever arrives in production. Each case is
 * therefore run at several chunk sizes, including one character at a time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerSplitter } from '../src/gemini.js';

/** Feed text through the splitter in fixed-size pieces, as the model streams it. */
function split(text, chunk) {
  const s = createAnswerSplitter();
  let grounded = '';
  let beyond = '';
  for (let i = 0; i < text.length; i += chunk) {
    const r = s.push(text.slice(i, i + chunk));
    grounded += r.grounded;
    beyond += r.beyond;
  }
  const e = s.end();
  return { grounded: (grounded + e.grounded).trim(), beyond: (beyond + e.beyond).trim() };
}

const CHUNKS = [1, 3, 7, 40, 1000];
const eachChunk = (text, check) => {
  for (const c of CHUNKS) check(split(text, c), c);
};

test('drops an opener that only describes the index', () => {
  eachChunk(
    'The indexed documentation does not contain information about Dune. Frank Herbert wrote it.',
    (r, c) => assert.equal(r.grounded, 'Frank Herbert wrote it.', `chunk ${c}`),
  );
});

test('drops it when the answer lives past the BEYOND marker', () => {
  // The shape of an off-topic reply: the grounded half is the deflection and
  // nothing else, so the grounded half should end up empty.
  eachChunk(
    'The documentation does not cover geography. ===BEYOND=== Paris.',
    (r, c) => {
      assert.equal(r.grounded, '', `chunk ${c}`);
      assert.equal(r.beyond, 'Paris.', `chunk ${c}`);
    },
  );
});

test('keeps a sentence that carries a real contrast', () => {
  const t = 'The documentation does not cover brushless motors, but it does establish 12V limits. So plan for that.';
  eachChunk(t, (r, c) => assert.equal(r.grounded, t, `chunk ${c}`));
});

test('keeps a legitimate mention that is not the opener', () => {
  // Rule 5 requires saying when the manual does not state a figure. Only the
  // first sentence is eligible for removal.
  const t = 'Use a 40:1 gearbox for the lift. The documentation does not state a torque figure.';
  eachChunk(t, (r, c) => assert.equal(r.grounded, t, `chunk ${c}`));
});

test('keeps it when it is the entire answer', () => {
  const t = 'The documentation does not cover this.';
  eachChunk(t, (r, c) => assert.equal(r.grounded, t, `chunk ${c}`));
});

test('leaves an ordinary answer untouched', () => {
  const t = 'R102 limits the starting configuration to an 18 inch cube. Check it in the sizing tool.';
  eachChunk(t, (r, c) => assert.equal(r.grounded, t, `chunk ${c}`));
});

test('a decimal in the first sentence is not a sentence end', () => {
  const t = 'POLLEN are 2.8 in. balls. Size the intake for variation.';
  eachChunk(t, (r, c) => assert.equal(r.grounded, t, `chunk ${c}`));
});

test('still strips the leading GROUNDED marker', () => {
  eachChunk(
    '===GROUNDED===\nR102 is the sizing rule. It is unchanged this season.',
    (r, c) => assert.equal(r.grounded, 'R102 is the sizing rule. It is unchanged this season.', `chunk ${c}`),
  );
});

test('citations never cross into the ungrounded half', () => {
  const r = split('Grounded claim. ===BEYOND=== Unsupported [3] thought.', 5);
  assert.match(r.beyond, /Unsupported/);
});
