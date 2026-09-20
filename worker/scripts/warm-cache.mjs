#!/usr/bin/env node
/**
 * Warm the answer cache for the questions the site links to.
 *
 *   node scripts/warm-cache.mjs [--api https://...] [--gap 8]
 *
 * Run this after any corpus change. Bumping CORPUS_EPOCH retires every cached
 * answer at once, which is the point — but it means the next person to click a
 * question on /season waits the full generation time. This pays that cost once,
 * from here, instead of charging it to a student in a pit.
 *
 * Two things learned the hard way on 2026-09-12:
 *
 *   - Send them ONE AT A TIME with a gap. Three at a time tripped the free
 *     tier's rate limit, and the questions that tripped it came back degraded.
 *   - VERIFY each one. The first version of this script measured bytes
 *     received and reported eight successes; four of those were degraded
 *     fallbacks, which are deliberately not cached, so half the warm silently
 *     did nothing. A degrade is a failure here, not a result.
 */
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const API = arg('api', 'https://sharp-ai.driveforge-ftc.workers.dev') + '/api/ask';
const GAP_S = Number(arg('gap', 8));

/** Keep in step with ANGLES in web/src/lib/season.ts. */
const QUESTIONS = [
  'How do you score points in BIOBUZZ?',
  'What are POLLEN and NECTAR, and how do they differ?',
  'How does a HIVE TIP work and what does it release?',
  'What can a robot do in the 30-second autonomous period?',
  'How much can a robot expand once the match starts?',
  'How does an alliance own a FLOWER, and when can it start?',
  'What are the ranking points this season and how do you earn them?',
  'How is the BIOBUZZ manual written differently, and what is the spirit of the rule?',
];

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function ask(question) {
  const started = Date.now();
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://sharpftc.pages.dev' },
    body: JSON.stringify({ question, turnstileToken: 'x' }),
  });
  if (!res.ok) return { ok: false, why: `http ${res.status}`, secs: (Date.now() - started) / 1000 };
  const body = await res.text();
  const degrade = body.match(/event: degrade\ndata: \{"reason":"([^"]+)"/);
  return {
    ok: !degrade,
    why: degrade ? degrade[1] : (body.includes('"cached":true') ? 'already warm' : 'generated'),
    secs: (Date.now() - started) / 1000,
  };
}

let warmed = 0;
const failed = [];
for (const [i, q] of QUESTIONS.entries()) {
  const r = await ask(q);
  if (r.ok) warmed += 1; else failed.push([q, r.why]);
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.secs.toFixed(1).padStart(5)}s  ${r.why.padEnd(13)} ${q.slice(0, 52)}`);
  if (i < QUESTIONS.length - 1) await sleep(GAP_S);
}

console.log(`\n  ${warmed}/${QUESTIONS.length} warm`);
if (failed.length) {
  // llm-quota on a single sequential request means the day's free-tier
  // allowance is gone, not that anything is broken. It comes back tomorrow.
  const quota = failed.some(([, why]) => why === 'llm-quota');
  console.log(quota
    ? '\n  Free-tier quota is spent for today — re-run after it resets.'
    : '\n  Re-run for the ones that failed.');
  process.exitCode = 1;
}
