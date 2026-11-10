import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {corsHeaders} from '../src/cors.js';
import {checkRateLimit} from '../src/ratelimit.js';

const config = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const SITE_ORIGIN = config.match(/^SITE_ORIGIN\s*=\s*"([^"]+)"/m)[1];

test('production CORS permits current and legacy Telemark, Sharp AI, and local development', () => {
  for (const origin of [...SITE_ORIGIN.split(','), 'http://localhost:3000', 'https://preview.sharpftc.pages.dev']) {
    const headers = corsHeaders({SITE_ORIGIN}, new Request('https://api.example', {headers: {origin}}));
    assert.equal(headers['access-control-allow-origin'], origin);
    assert.match(headers['access-control-allow-methods'], /POST/);
    assert.equal(headers.vary, 'origin');
  }
});

test('unrelated Pages sites cannot read responses', () => {
  for (const origin of ['https://attacker.pages.dev', 'https://telemarkfirst.github.io.attacker.invalid']) {
    const headers = corsHeaders({SITE_ORIGIN}, new Request('https://api.example', {headers: {origin}}));
    assert.notEqual(headers['access-control-allow-origin'], origin);
  }
});

test('classmates on one IP have separate hashed account budgets', async () => {
  const data = new Map();
  const env = {RATE: {get: async (k) => data.get(k) ?? null, put: async (k, v) => data.set(k, v)},
    RATE_PER_DAY: '1', RATE_PER_DAY_SIGNED_IN: '2', FIREBASE_PROJECT_ID: 'telemark-e9159'};
  const req = new Request('https://api.example', {headers: {'cf-connecting-ip': '192.0.2.1'}});
  for (let i = 0; i < 2; i++) await (await checkRateLimit(env, req, {uid: 'student-a'})).commit();
  assert.equal((await checkRateLimit(env, req, {uid: 'student-a'})).scope, 'day');
  assert.equal((await checkRateLimit(env, req, {uid: 'student-b'})).dayUsed, 0);
  const guest = await checkRateLimit(env, req);
  assert.equal(guest.dayLimit, 1);
  await guest.commit();
  assert.equal((await checkRateLimit(env, req)).scope, 'day');
  assert.equal([...data.keys()].some((k) => /student-|192\.0\.2/.test(k)), false);
});
