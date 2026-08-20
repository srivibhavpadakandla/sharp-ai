/**
 * Token accounting from Gemini's own usageMetadata.
 *
 * The site rations questions, not tokens, because questions are what it can
 * cheaply count before a call. This module records what those questions
 * actually cost afterwards, so the two can be compared.
 */

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Normalise a Gemini usageMetadata block. Field names differ between models and
 * some are absent entirely, so every one is optional and defaults to zero — a
 * missing field must not turn the whole row into NaN.
 */
export function readUsage(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // Tool-use prompt tokens are billed as input but reported separately.
  const prompt = n(meta.promptTokenCount) + n(meta.toolUsePromptTokenCount);
  const thoughts = n(meta.thoughtsTokenCount);
  const output = n(meta.candidatesTokenCount);
  const total = n(meta.totalTokenCount) || prompt + thoughts + output;
  if (!total) return null;
  return { prompt, thoughts, output, total };
}

/**
 * Fold one call into today's row. Never throws: accounting must not be able to
 * fail an answer that has already been written to the reader.
 */
export async function recordTokens(env, kind, usage) {
  if (!env?.DB || !usage) return;
  try {
    await env.DB.prepare(
      `INSERT INTO token_usage (day, kind, calls, prompt_tokens, thoughts_tokens, output_tokens, total_tokens)
       VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6)
       ON CONFLICT(day, kind) DO UPDATE SET
         calls           = calls + 1,
         prompt_tokens   = prompt_tokens   + excluded.prompt_tokens,
         thoughts_tokens = thoughts_tokens + excluded.thoughts_tokens,
         output_tokens   = output_tokens   + excluded.output_tokens,
         total_tokens    = total_tokens    + excluded.total_tokens`,
    ).bind(dayKey(), String(kind || 'answer'), usage.prompt, usage.thoughts, usage.output, usage.total).run();
  } catch (err) {
    console.warn('token accounting failed', err.message);
  }
}

/** Today's totals by kind, plus a 7-day roll-up. */
export async function tokenReport(env) {
  if (!env?.DB) return null;
  const today = dayKey();
  const since = dayKey(new Date(Date.now() - 6 * 864e5));
  const [rows, week] = await Promise.all([
    env.DB.prepare('SELECT * FROM token_usage WHERE day = ?1').bind(today).all().catch(() => null),
    env.DB.prepare(
      `SELECT sum(calls) AS calls, sum(total_tokens) AS total
         FROM token_usage WHERE day >= ?1`,
    ).bind(since).first().catch(() => null),
  ]);
  const byKind = rows?.results || [];
  const sum = (f) => byKind.reduce((n, r) => n + (r[f] || 0), 0);
  const calls = sum('calls');
  const total = sum('total_tokens');
  return {
    day: today,
    calls,
    prompt: sum('prompt_tokens'),
    thoughts: sum('thoughts_tokens'),
    output: sum('output_tokens'),
    total,
    // The number worth watching: what a question actually costs on average.
    perCall: calls ? Math.round(total / calls) : 0,
    byKind: Object.fromEntries(byKind.map((r) => [r.kind, {
      calls: r.calls, total: r.total_tokens,
      prompt: r.prompt_tokens, thoughts: r.thoughts_tokens, output: r.output_tokens,
    }])),
    last7: { calls: week?.calls || 0, total: week?.total || 0 },
  };
}
