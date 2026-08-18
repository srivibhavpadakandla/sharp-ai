#!/usr/bin/env node
/**
 * Weekly log digest.
 *
 *   npm run digest
 *
 * The query log and the feedback table have been collecting since launch and
 * nobody was reading them. The first time anyone looked, six of the six most
 * recent refusals were the same topic — a gap that had been sitting in plain
 * sight. This turns that from an accident into a habit.
 *
 * Reads the remote D1 through wrangler; makes no changes.
 */
import { execFileSync } from 'node:child_process';

const DAYS = Number(process.argv[2] || 7);

function q(sql) {
  const out = execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'sharp-ai', '--remote', '-y', '--json', '--command', sql,
  ], { cwd: new URL('..', import.meta.url).pathname.replace(/\/$/, '') + '/../worker', encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = out.match(/\[[\s\S]*\]/);
  return m ? (JSON.parse(m[0])[0]?.results ?? []) : [];
}

const since = `datetime('now', '-${DAYS} days')`;
const bar = (n, max, w = 26) => '█'.repeat(Math.max(1, Math.round((n / Math.max(max, 1)) * w)));

console.log(`\nSharp AI — last ${DAYS} days\n${'='.repeat(60)}`);

const [t] = q(`SELECT count(*) q, sum(below_threshold) refused, sum(cache_hit) cached,
  sum(llm_called) llm, sum(degraded) degraded, round(avg(latency_ms)) ms
  FROM query_log WHERE ts > ${since}`);
if (!t || !t.q) { console.log('No queries in this window.\n'); process.exit(0); }

const pct = (n) => `${Math.round((100 * (n || 0)) / t.q)}%`;
console.log(`questions ${t.q}   refused ${t.refused || 0} (${pct(t.refused)})   `
  + `cached ${t.cached || 0} (${pct(t.cached)})   llm calls ${t.llm || 0}   avg ${t.ms}ms`);
if (t.degraded) console.log(`  ${t.degraded} answers degraded — the daily ceiling was hit`);

// --- the gap list: what people asked that we could not answer --------------
const refused = q(`SELECT question, count(*) n FROM query_log
  WHERE below_threshold = 1 AND ts > ${since}
  GROUP BY question_hash ORDER BY n DESC, question LIMIT 12`);
if (refused.length) {
  console.log(`\nREFUSED — the coverage gap, most asked first\n${'-'.repeat(60)}`);
  const max = refused[0].n;
  for (const r of refused) console.log(`  ${String(r.n).padStart(3)} ${bar(r.n, max, 14)} ${r.question.slice(0, 60)}`);
}

// --- weak retrieval: answered, but barely ---------------------------------
const weak = q(`SELECT question, round(best_cosine, 3) cos FROM query_log
  WHERE llm_called = 1 AND best_cosine IS NOT NULL AND best_cosine < 0.68 AND ts > ${since}
  ORDER BY best_cosine ASC LIMIT 8`);
if (weak.length) {
  console.log(`\nWEAK RETRIEVAL — answered anyway, worth checking\n${'-'.repeat(60)}`);
  for (const r of weak) console.log(`  cos=${r.cos}  ${r.question.slice(0, 62)}`);
}

// --- what readers actually said -------------------------------------------
const fb = q(`SELECT verdict, count(*) n FROM feedback WHERE ts > ${since} GROUP BY verdict`);
if (fb.length) {
  const up = fb.find((x) => x.verdict === 'up')?.n || 0;
  const down = fb.find((x) => x.verdict === 'down')?.n || 0;
  console.log(`\nFEEDBACK   ${up} helpful · ${down} not helpful`);
  const bad = q(`SELECT question, source_ids FROM feedback
    WHERE verdict = 'down' AND ts > ${since} ORDER BY ts DESC LIMIT 6`);
  for (const r of bad) console.log(`  ✗ ${r.question.slice(0, 56)}  ${r.source_ids || ''}`);
}

console.log('\nMost-refused topics are the next source to index.\n');
