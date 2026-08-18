#!/usr/bin/env node
/**
 * Pre-answer the seeded questions so the landing page's browsable index links
 * to real /q/<slug> pages rather than to a spinner.
 *
 *   node scripts/seed-answers.mjs https://sharp-ai.<subdomain>.workers.dev
 *
 * Paced under the Worker's own per-minute rate limit — the seeder is a normal
 * client and gets no special treatment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const here = path.dirname(fileURLToPath(import.meta.url));
const seeds = JSON.parse(fs.readFileSync(path.join(here, '../src/lib/seed-questions.json'), 'utf8'));

const questions = Object.values(seeds).flat();
const GAP_MS = 7000;   // < the 10/min per-IP limit, with headroom

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, refused = 0, failed = 0;

for (const [i, question] of questions.entries()) {
  const res = await fetch(`${API}/api/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, turnstileToken: 'seed' }),
  });

  if (!res.ok) {
    console.log(`  ✗ ${res.status}  ${question}`);
    failed += 1;
    await sleep(GAP_MS);
    continue;
  }

  let slug = null, wasRefused = false, chars = 0;
  const text = await res.text();
  for (const block of text.split('\n\n')) {
    const data = block.split('\n').find((l) => l.startsWith('data:'));
    if (!data) continue;
    try {
      const j = JSON.parse(data.slice(5));
      if (j.refused) wasRefused = true;
      if (typeof j.t === 'string') chars += j.t.length;
      if (j.slug) slug = j.slug;
    } catch { /* skip */ }
  }

  if (wasRefused) { refused += 1; console.log(`  – refused  ${question}`); }
  else if (slug) { ok += 1; console.log(`  ✓ /q/${slug}`); }
  else { failed += 1; console.log(`  ✗ no slug (${chars} chars)  ${question}`); }

  if (i < questions.length - 1) await sleep(GAP_MS);
}

console.log(`\nseeded ${ok} · refused ${refused} · failed ${failed} of ${questions.length}`);
