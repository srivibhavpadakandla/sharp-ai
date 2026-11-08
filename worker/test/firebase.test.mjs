import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyFirebaseToken} from '../src/firebase.js';

const env = {FIREBASE_PROJECT_ID: 'telemark-e9159'};
const pair = await crypto.subtle.generateKey(
  {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'},
  true, ['sign', 'verify'],
);
const jwk = {...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key'};
const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
async function token(changes = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({alg: 'RS256', kid: 'test-key', ...header})}.${encode({
    aud: env.FIREBASE_PROJECT_ID, iss: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    sub: 'student-a', exp: now + 3600, iat: now - 5, auth_time: now - 10, ...changes,
  })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

test('verifies a signed Telemark token and reuses Google public keys', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    calls++;
    return Response.json({keys: [jwk]});
  };
  try {
    assert.equal((await verifyFirebaseToken(env, await token())).uid, 'student-a');
    assert.equal((await verifyFirebaseToken(env, await token({sub: 'student-b'}))).uid, 'student-b');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

for (const [name, claims, reason] of [
  ['another Firebase project', {aud: 'other'}, 'wrong-audience'],
  ['another issuer', {iss: 'https://attacker.invalid'}, 'wrong-issuer'],
  ['expired token', {exp: 1}, 'expired'],
  ['missing expiry', {exp: null}, 'expired'],
  ['future issue time', {iat: 9999999999}, 'future-iat'],
  ['missing issue time', {iat: null}, 'future-iat'],
  ['future authentication', {auth_time: 9999999999}, 'bad-auth-time'],
  ['missing authentication', {auth_time: null}, 'bad-auth-time'],
  ['empty subject', {sub: ''}, 'no-subject'],
  ['object subject', {sub: {}}, 'no-subject'],
  ['oversized subject', {sub: 'a'.repeat(129)}, 'no-subject'],
]) {
  test(`rejects ${name}`, async () => {
    assert.equal((await verifyFirebaseToken(env, await token(claims))).reason, reason);
  });
}

test('rejects a tampered signature and malformed input without throwing', async () => {
  const valid = await token();
  const parts = valid.split('.');
  parts[1] = encode({sub: 'attacker'});
  assert.equal((await verifyFirebaseToken(env, parts.join('.'))).reason, 'bad-signature');
  for (const malformed of ['bad', 'null.null.null', `${parts[0]}.${parts[1]}.!`, {}, 'x'.repeat(17000)]) {
    assert.equal((await verifyFirebaseToken(env, malformed)).ok, false);
  }
  assert.equal((await verifyFirebaseToken(env, await token({}, {alg: 'none'}))).reason, 'bad-alg');
  assert.equal((await verifyFirebaseToken(env, await token({}, {kid: 'unknown'}))).reason, 'unknown-kid');
  assert.equal((await verifyFirebaseToken({}, valid)).reason, 'not-configured');
});
