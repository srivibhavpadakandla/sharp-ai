/**
 * Per-IP rate limiting and the hard daily LLM ceiling, both on Workers KV.
 *
 * Two things to know about KV here:
 *   1. It is eventually consistent, so these counters are approximate. That is
 *      fine — this is an abuse damper, not an accounting system.
 *   2. The free tier allows 1000 writes/day. An uncached question costs about
 *      three (minute bucket, day bucket, answer cache), which is why
 *      LLM_DAILY_CEILING defaults to 200 rather than something larger.
 */

/** IPs are hashed and never stored in the log; only the hash reaches KV. */
async function hashIp(ip, salt = 'sharp-ai') {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const minuteKey = (d = new Date()) => d.toISOString().slice(0, 16);

async function bump(kv, key, ttl) {
  const current = Number((await kv.get(key)) || 0);
  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: ttl });
  return next;
}

export async function checkRateLimit(env, request) {
  const ip = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '0.0.0.0';
  const id = await hashIp(ip);

  const perMin = Number(env.RATE_PER_MIN || 10);
  const perDay = Number(env.RATE_PER_DAY || 100);

  const mKey = `rl:m:${id}:${minuteKey()}`;
  const dKey = `rl:d:${id}:${dayKey()}`;

  const [mCount, dCount] = await Promise.all([
    env.RATE.get(mKey).then(Number),
    env.RATE.get(dKey).then(Number),
  ]);

  if (mCount >= perMin) {
    return { ok: false, retryAfter: 60, scope: 'minute', limit: perMin };
  }
  if (dCount >= perDay) {
    return { ok: false, retryAfter: 3600, scope: 'day', limit: perDay };
  }

  return {
    ok: true,
    // Surfaced so the UI can show what is left before someone hits a wall
    // mid-thought, rather than only finding out when they are refused.
    dayUsed: dCount || 0,
    dayLimit: perDay,
    minUsed: mCount || 0,
    minLimit: perMin,
    /** Called only once the request is actually going to do work. */
    async commit() {
      await Promise.all([
        bump(env.RATE, mKey, 120),
        bump(env.RATE, dKey, 90000),
      ]);
    },
  };
}

/**
 * The hard daily LLM ceiling. Reserving before the call (rather than counting
 * after) means a burst cannot overshoot the free tier.
 */
export async function reserveLlmCall(env) {
  const ceiling = Number(env.LLM_DAILY_CEILING || 200);
  const key = `llm:${dayKey()}`;
  const used = Number((await env.RATE.get(key)) || 0);
  if (used >= ceiling) return { granted: false, used, ceiling };
  await env.RATE.put(key, String(used + 1), { expirationTtl: 90000 });
  return { granted: true, used: used + 1, ceiling };
}

export async function llmUsage(env) {
  const ceiling = Number(env.LLM_DAILY_CEILING || 200);
  const used = Number((await env.RATE.get(`llm:${dayKey()}`)) || 0);
  return { used, ceiling, remaining: Math.max(0, ceiling - used) };
}

/** The caller's own daily usage, without spending any of it. */
export async function ipUsage(env, request) {
  const ip = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '0.0.0.0';
  const id = await hashIp(ip);
  const perDay = Number(env.RATE_PER_DAY || 100);
  const used = Number((await env.RATE.get(`rl:d:${id}:${dayKey()}`)) || 0);
  return { used, limit: perDay, remaining: Math.max(0, perDay - used) };
}
