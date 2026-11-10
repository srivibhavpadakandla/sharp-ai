import assert from 'node:assert/strict';
import test from 'node:test';
import { classify } from '../src/lib/topic.js';

test('FLL and SPIKE Prime questions stay in the robotics answer path', () => {
  for (const question of [
    'How do I use Pybricks DriveBase in FLL?',
    'How should I calibrate a SPIKE Prime color sensor?',
    'What happens during the FIRST LEGO League Robot Game?',
  ]) {
    assert.equal(classify(question).kind, 'ftc', question);
  }
});
