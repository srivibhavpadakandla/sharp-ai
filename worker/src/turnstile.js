/**
 * Cloudflare Turnstile verification.
 *
 * Defaults are Cloudflare's published *testing* keys, which always pass. That
 * keeps the flow genuinely wired end to end in development; swap in real keys
 * with `wrangler secret put TURNSTILE_SECRET` before the site is public.
 */
export const TESTING_SITE_KEY = '1x00000000000000000000AA';
export const TESTING_SECRET = '1x0000000000000000000000000000000AA';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(env, token, request) {
  if (String(env.REQUIRE_TURNSTILE) === 'false') return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing-token' };

  const secret = env.TURNSTILE_SECRET || TESTING_SECRET;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
    const data = await res.json();
    return data.success
      ? { ok: true }
      : { ok: false, reason: (data['error-codes'] || ['invalid']).join(','), };
  } catch (err) {
    return { ok: false, reason: `verify-failed:${err.message}` };
  }
}
