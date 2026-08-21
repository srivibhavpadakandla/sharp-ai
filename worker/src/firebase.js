/**
 * Firebase ID token verification.
 *
 * A signed-in student is a better rate limit subject than an IP address: a
 * school shares one address across a whole lab, so IP limits punish the class
 * for one person's questions, and an anonymous visitor can clear them by
 * changing networks. An account is the thing we actually want to meter.
 *
 * Verification is done here rather than by calling Google on every request.
 * The signing keys are public, they rotate slowly, and one fetch per key
 * rotation is cheaper and more reliable than an outbound round trip in the
 * path of every question.
 */

const JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let keyCache = {keys: null, fetchedAt: 0};
/** Google rotates daily; an hour keeps us well inside that with one fetch. */
const KEY_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJson(segment) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));
}

async function signingKeys(now) {
  if (keyCache.keys && now - keyCache.fetchedAt < KEY_TTL_MS) return keyCache.keys;
  const response = await fetch(JWK_URL);
  if (!response.ok) throw new Error(`jwk-fetch-${response.status}`);
  const body = await response.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey(
        'jwk',
        jwk,
        {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
        false,
        ['verify'],
      ),
    );
  }
  keyCache = {keys, fetchedAt: now};
  return keys;
}

/**
 * Returns {ok: true, uid, email} for a valid token, or {ok: false, reason}.
 *
 * Every failure is a plain reason string rather than an exception, so the
 * caller can fall back to the anonymous path instead of returning a 500 to a
 * student whose token merely expired while the tab was open.
 */
export async function verifyFirebaseToken(env, token) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) return {ok: false, reason: 'not-configured'};
  if (!token || typeof token !== 'string') return {ok: false, reason: 'missing-token'};

  const parts = token.split('.');
  if (parts.length !== 3) return {ok: false, reason: 'malformed'};

  let header;
  let claims;
  try {
    header = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
  } catch {
    return {ok: false, reason: 'malformed'};
  }

  if (header.alg !== 'RS256') return {ok: false, reason: 'bad-alg'};

  let keys;
  try {
    keys = await signingKeys(Date.now());
  } catch {
    return {ok: false, reason: 'jwk-unavailable'};
  }
  const key = keys.get(header.kid);
  if (!key) return {ok: false, reason: 'unknown-kid'};

  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) return {ok: false, reason: 'bad-signature'};

  // Claim checks come after the signature so an attacker cannot learn which
  // claim they got wrong by probing with unsigned tokens.
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId) return {ok: false, reason: 'wrong-audience'};
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    return {ok: false, reason: 'wrong-issuer'};
  }
  if (typeof claims.exp !== 'number' || claims.exp <= now) return {ok: false, reason: 'expired'};
  if (typeof claims.iat !== 'number' || claims.iat > now + 60) return {ok: false, reason: 'future-iat'};
  if (!claims.sub) return {ok: false, reason: 'no-subject'};

  return {ok: true, uid: claims.sub, email: claims.email || null};
}
