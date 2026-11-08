import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = {
  FIREBASE_PROJECT_ID: 'telemark-e9159', REQUIRE_TURNSTILE: 'true',
  SITE_ORIGIN: 'https://sharpftc.pages.dev,https://telemarkfirst.github.io',
};
const request = (body) => new Request('https://sharp-ai.example/api/ask', {
  method: 'POST', headers: {'content-type': 'application/json', origin: 'https://telemarkfirst.github.io'},
  body: JSON.stringify(body),
});
const ctx = {waitUntil: () => {}};

test('a signed Telemark request streams without Turnstile or model calls', async () => {
  const pair = await crypto.subtle.generateKey(
    {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'},
    true, ['sign', 'verify'],
  );
  const jwk = {...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'route-key'};
  const now = Math.floor(Date.now() / 1000);
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const input = `${encode({alg: 'RS256', kid: 'route-key'})}.${encode({
    aud: env.FIREBASE_PROJECT_ID, iss: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    sub: 'test-student', exp: now + 3600, iat: now - 5, auth_time: now - 10,
  })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
  const idToken = `${input}.${Buffer.from(signature).toString('base64url')}`;
  const original = globalThis.fetch;
  let keyCalls = 0;
  globalThis.fetch = async (url) => {
    assert.match(url, /googleapis.com\/service_accounts/);
    keyCalls++;
    return Response.json({keys: [jwk]});
  };
  try {
    const response = await worker.fetch(request({question: 'hello', idToken, chat: true}), env, ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://telemarkfirst.github.io');
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const stream = await response.text();
    assert.match(stream, /event: token/);
    assert.match(stream, /event: done/);
    assert.equal(keyCalls, 1);
  } finally { globalThis.fetch = original; }
});

test('invalid account tokens cannot bypass validation with a CAPTCHA', async () => {
  const response = await worker.fetch(request({question: 'hello', idToken: 'invalid', turnstileToken: 'test'}), env, ctx);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'auth-failed');
});

test('public Sharp AI still requires Turnstile', async () => {
  const response = await worker.fetch(request({question: 'hello'}), env, ctx);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'turnstile-failed');
});

test('verification configuration failure is retryable, not an expired session', async () => {
  const response = await worker.fetch(request({question: 'hello', idToken: 'invalid'}), {...env, FIREBASE_PROJECT_ID: ''}, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'auth-unavailable');
});
