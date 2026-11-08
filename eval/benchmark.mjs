#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {cases} from './cases.mjs';

export const datasetHash = createHash('sha256').update(JSON.stringify(cases)).digest('hex');
export const dimensions = ['correctness', 'usefulness', 'citationSupport'];

export function parseSseFrame(raw) {
  let event = 'message';
  const data = [];
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try { return {event, data: JSON.parse(data.join('\n'))}; } catch { return null; }
}

export function collectFrames(frames) {
  const result = {answer: '', beyond: '', citations: [], excerpts: [], evidence: [],
    complete: false, degraded: false, refused: false, privateContext: null, cached: null, tutor: null, error: null, events: []};
  for (const frame of frames) {
    if (!frame) continue;
    const {event, data} = frame;
    if (!data || typeof data !== 'object') continue;
    result.events.push(event);
    if (event === 'meta') {
      result.citations = Array.isArray(data.citations) ? data.citations : [];
      result.excerpts = Array.isArray(data.excerpts) ? data.excerpts : [];
      result.refused = data.refused === true;
      result.privateContext = typeof data.privateContext === 'boolean' ? data.privateContext : null;
      result.cached = typeof data.cached === 'boolean' ? data.cached : null;
      result.tutor = data.tutor && typeof data.tutor === 'object' ? data.tutor : null;
    } else if (event === 'token' && typeof data.t === 'string') result.answer += data.t;
    else if (event === 'beyond' && typeof data.t === 'string') result.beyond += data.t;
    else if (event === 'evidence') result.evidence.push(data);
    else if (event === 'degrade') { result.degraded = true; result.degradeReason = String(data.reason || 'unknown'); result.fallbackAnswer = typeof data.answerMd === 'string' ? data.answerMd : ''; }
    else if (event === 'error') result.error = 'stream-error';
    else if (event === 'done') result.complete = true;
  }
  return result;
}

export function parseSse(text) {
  return collectFrames(text.replace(/\r\n/g, '\n').split('\n\n').map(parseSseFrame));
}

export async function readSse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const frames = [];
  let buffer = '';
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) { buffer += decoder.decode(); break; }
      buffer = (buffer + decoder.decode(value, {stream: true})).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        frames.push(parseSseFrame(buffer.slice(0, end)));
        buffer = buffer.slice(end + 2);
      }
    }
    if (buffer.trim()) frames.push(parseSseFrame(buffer));
    return collectFrames(frames);
  } catch (error) {
    if (buffer.trim()) frames.push(parseSseFrame(buffer));
    error.partial = collectFrames(frames);
    throw error;
  } finally { reader.releaseLock(); }
}

/** These checks describe response structure. They do not grade factual correctness or entailment. */
export function structuralChecks(scenario, result) {
  const failures = [];
  if (result.status === 'not-run') return {status: 'not-run', failures: ['No answer recorded.']};
  if (result.privateContext === false || result.cached === true) failures.push('Worker response indicates shared context or cache; benchmark requests must stay private.');
  if (result.error) failures.push(String(result.error));
  if (!result.complete) failures.push('No terminal done event.');
  if (result.degraded) failures.push(`Source-only fallback (${result.degradeReason || 'unknown'}).`);
  if (result.refused) failures.push('The scenario was refused; reviewer must investigate.');
  if (!result.answer?.trim()) failures.push('No grounded answer text.');
  if (scenario.sourceRequirements.required && !result.citations?.length) failures.push('Required citations are absent.');
  const ns = new Set((result.citations || []).map((c) => c.n));
  const text = String(result.answer || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  for (const match of text.matchAll(/(?<![\w])\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of match[1].split(',').map(Number)) {
      if (!ns.has(n)) failures.push(`Citation [${n}] has no source record.`);
    }
  }
  return {status: failures.length ? 'failed' : 'ready-for-review', failures: [...new Set(failures)]};
}

export function scoreRun(run, judgments = {}) {
  const selected = new Map(cases.map((c) => [c.id, c]));
  const seen = new Set();
  if (run.datasetHash && run.datasetHash !== datasetHash) throw new Error('Dataset changed; review the recorded run with the matching dataset revision.');
  for (const id of Object.keys(judgments)) {
    if (!selected.has(id)) throw new Error(`Unknown judgment case ID: ${id}`);
  }
  const rows = (run.records || []).map((r) => {
    if (seen.has(r.id)) throw new Error(`Duplicate case ID: ${r.id}`);
    seen.add(r.id);
    const scenario = selected.get(r.id);
    if (!scenario) throw new Error(`Unknown case ID: ${r.id}`);
    const checks = structuralChecks(scenario, r);
    const j = judgments[r.id];
    if (checks.status !== 'ready-for-review') return {...r, checks, reviewStatus: checks.status, reviewerType: null, scores: null, rationale: null};
    if (!j) return {...r, checks, reviewStatus: 'awaiting-human-review', reviewerType: null, scores: null, rationale: null};
    const reviewerType = j.reviewerType === undefined ? 'human' : j.reviewerType;
    if (!['human', 'model'].includes(reviewerType)) throw new Error(`Judgment ${r.id} reviewerType must be human or model.`);
    if (!j.rationale?.trim() || dimensions.some((d) => !Number.isInteger(j[d]) || j[d] < 0 || j[d] > 4)) {
      throw new Error(`Judgment ${r.id} needs a rationale and integer scores 0–4 for every dimension.`);
    }
    const scores = Object.fromEntries(dimensions.map((d) => [d, j[d]]));
    const passed = dimensions.every((d) => scores[d] >= 3);
    const reviewStatus = reviewerType === 'human'
      ? passed ? 'passed' : 'failed-human-review'
      : passed ? 'passed-model-review' : 'failed-model-review';
    return {...r, checks, reviewStatus, reviewerType, scores, rationale: j.rationale};
  });
  const humanReviewed = rows.filter((r) => r.scores && r.reviewerType === 'human');
  const modelReviewed = rows.filter((r) => r.scores && r.reviewerType === 'model');
  const passed = rows.filter((r) => r.reviewStatus === 'passed').length;
  const provisionalModelPassed = rows.filter((r) => r.reviewStatus === 'passed-model-review').length;
  const failures = rows.filter((r) => ['failed', 'failed-human-review', 'failed-model-review'].includes(r.reviewStatus)).length;
  // Model assessments are provisional and remain pending human review, even when all model scores pass.
  const pending = rows.length - humanReviewed.length - rows.filter((r) => r.reviewStatus === 'failed').length;
  const means = (reviewed) => reviewed.length ? Object.fromEntries(dimensions.map((d) =>
    [d, Number((reviewed.reduce((sum, r) => sum + r.scores[d], 0) / reviewed.length).toFixed(2))])) : null;
  return {...run, records: rows, summary: {
    total: rows.length, humanReviewed: humanReviewed.length, modelReviewed: modelReviewed.length,
    passed, provisionalModelPassed, failures, pending,
    qualityEstablished: rows.length > 0 && passed === rows.length && humanReviewed.length === rows.length,
    // Keep the existing manual-review field human-only; model means always have a separate label.
    reviewedOnlyMeans: means(humanReviewed),
    modelOnlyMeans: means(modelReviewed),
  }};
}

const esc = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function markdownReport(run) {
  const lookup = new Map(cases.map((c) => [c.id, c]));
  const out = ['# Sharp AI answer-quality review', '',
    'All scenarios are synthetic. Automated checks measure structure only; correctness, usefulness, and source support require human review.', '',
    `Recorded: ${run.createdAt}`, `Mode: ${run.mode}`, `Dataset SHA-256: ${run.datasetHash || 'not recorded (legacy/fixture)'}`, ''];
  if (run.summary) out.push(`Cases: ${run.summary.total} · Human reviewed: ${run.summary.humanReviewed} · Model reviewed (provisional): ${run.summary.modelReviewed || 0} · Human passed: ${run.summary.passed} · Provisional model passed: ${run.summary.provisionalModelPassed || 0} · Failed checks/reviews: ${run.summary.failures} · Pending human review: ${run.summary.pending}`, '',
    run.summary.qualityEstablished ? 'Every recorded case passed human review.' : '**Answer quality has not been established for this run.**', '');
  if (run.summary?.reviewedOnlyMeans) out.push('Human-reviewed means (reviewed answers only):', '', '```json', JSON.stringify(run.summary.reviewedOnlyMeans, null, 2), '```', '');
  if (run.summary?.modelOnlyMeans) out.push('Model-only means (provisional; not human validation):', '', '```json', JSON.stringify(run.summary.modelOnlyMeans, null, 2), '```', '');
  for (const result of run.records) {
    const c = lookup.get(result.id);
    out.push(`## ${c.id} · ${c.category}`, '', esc(c.question), '',
      `Status: ${result.reviewStatus || result.status || 'recorded'}`, '',
      'Expected behaviors:', ...c.expectedBehaviors.map((x) => `- ${esc(x)}`), '',
      'Unacceptable claims:', ...c.unacceptableClaims.map((x) => `- ${esc(x)}`), '',
      'Source review:', esc(c.sourceRequirements.guidance), ...c.sourceRequirements.reviewerLinks.map((x) => `- ${x}`), '',
      'Answer:', '', esc(result.answer || '_No answer recorded._'), '');
    if (result.tutor) out.push('Returned tutoring / diagnostic guidance:', '', '```json', JSON.stringify(result.tutor, null, 2), '```', '');
    if (result.privateContext !== undefined) out.push(`Private context reported by Worker: ${result.privateContext === true ? 'yes' : result.privateContext === false ? 'no' : 'not specified'}`, '');
    if (c.learning) out.push('Attached synthetic learning context:', '', '```json', JSON.stringify(c.learning, null, 2), '```', '');
    if (result.fallbackAnswer) out.push('Source-only fallback (not scored as an answer):', '', esc(result.fallbackAnswer), '');
    if (result.beyond) out.push('Uncited reasoning (review separately):', '', esc(result.beyond), '');
    if (result.citations?.length) out.push('Returned sources:', ...result.citations.map((s) => `- [${s.n}] ${esc(s.sourceName)} — ${esc(s.url)}`), '');
    if (result.evidence?.length) out.push('Evidence event payloads:', '', '```json', JSON.stringify(result.evidence, null, 2), '```', '');
    if (result.checks?.failures.length) out.push('Structural failures:', ...result.checks.failures.map((x) => `- ${esc(x)}`), '');
    out.push(result.reviewerType === 'model' ? 'Model scores (0–4, provisional; human review still required):' : 'Human scores (0–4):', ...dimensions.map((d) => `- ${d}: ${result.scores?.[d] ?? 'unreviewed'} — ${c.rubric[d]}`),
      '', `Rationale: ${esc(result.rationale || 'Not reviewed.')}`, '');
  }
  return out.join('\n');
}

export function selectCases({id, ids, category, limit = 3} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw new Error('--limit must be an integer from 1 to 40.');
  if (id && ids) throw new Error('Use --id or --ids, not both.');
  const requested = ids ? String(ids).split(',').map((x) => x.trim()).filter(Boolean) : null;
  if (requested && (new Set(requested).size !== requested.length || requested.some((x) => !cases.some((c) => c.id === x)))) {
    throw new Error('--ids must contain distinct known case IDs separated by commas.');
  }
  const filtered = cases.filter((c) => (!id || c.id === id) && (!requested || requested.includes(c.id)) && (!category || c.category === category));
  if (!filtered.length) throw new Error('No matching cases.');
  return filtered.slice(0, limit);
}

function parseArgs(argv) {
  const args = {command: 'plan'};
  if (argv[0] && !argv[0].startsWith('--')) args.command = argv.shift();
  const values = new Set(['id','ids','category','limit','out','input','judgments','endpoint','delay-ms','timeout-ms','tokens']);
  const flags = new Set(['live','testing-turnstile','help']);
  while (argv.length) {
    const key = argv.shift().replace(/^--/, '');
    if (flags.has(key)) args[key] = true;
    else if (values.has(key)) {
      if (!argv.length || argv[0].startsWith('--')) throw new Error(`--${key} needs a value.`);
      args[key] = argv.shift();
    } else throw new Error(`Unknown option: ${key}`);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeLabel = (v) => typeof v === 'string' && /^[a-z0-9-]{1,80}$/i.test(v) ? v : 'request-failed';

export function retryDelay(header, now = Date.now()) {
  if (!header) return 0;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

async function liveRun(selected, args) {
  if (!args.live) throw new Error('Live requests require run --live. The default plan command never connects.');
  const endpoint = new URL(args.endpoint || 'https://sharp-ai.srivibhavp.workers.dev/api/ask');
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Use an endpoint URL without credentials, query parameters, or a fragment.');
  if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('Endpoint must use HTTP or HTTPS.');
  const local = ['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !local) throw new Error('Non-local endpoints require HTTPS.');
  const delay = Number(args['delay-ms'] ?? 30000);
  const timeout = Number(args['timeout-ms'] ?? 90000);
  if (!Number.isFinite(delay) || delay < 0 || delay > 300000) throw new Error('--delay-ms must be 0–300000.');
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 180000) throw new Error('--timeout-ms must be 1000–180000.');
  let tokenMap = {};
  if (args.tokens) {
    try { tokenMap = JSON.parse(await fs.readFile(args.tokens, 'utf8')); }
    catch { throw new Error('Could not read the token map; use a valid local JSON object keyed by case ID.'); }
    if (!tokenMap || typeof tokenMap !== 'object' || Array.isArray(tokenMap)) throw new Error('Token map must be a JSON object keyed by case ID.');
  }
  const oneToken = process.env.TURNSTILE_TOKEN ? [process.env.TURNSTILE_TOKEN] : [];
  if (oneToken.length && selected.length > 1 && !args.tokens && !args['testing-turnstile']) {
    throw new Error('TURNSTILE_TOKEN is single-use. Select one case or supply fresh per-case tokens with --tokens.');
  }
  const takeToken = (id) => {
    if (args['testing-turnstile']) return 'XXXX.DUMMY.TOKEN.XXXX';
    const queue = tokenMap[id];
    if (Array.isArray(queue)) return queue.shift() || null;
    if (typeof queue === 'string') { delete tokenMap[id]; return queue; }
    return oneToken.shift() || null;
  };
  if (!args['testing-turnstile'] && !oneToken.length && !args.tokens) throw new Error('Provide a fresh TURNSTILE_TOKEN, --tokens file, or explicitly use --testing-turnstile on a testing-key deployment.');
  const records = [];
  let halted = null;
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    if (halted) { records.push({id: c.id, status: 'not-run', error: halted}); continue; }
    if (i) await sleep(delay);
    let token = takeToken(c.id);
    if (!token) { records.push({id:c.id, status:'not-run', error:'No fresh token for this case.'}); continue; }
    const started = Date.now();
    let recorded;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(endpoint, {method:'POST', headers:{'content-type':'application/json'},
          body:JSON.stringify({question:c.question, learning:{mode:'explain', files:[], ...c.learning}, turnstileToken:token}), signal:controller.signal});
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          const retry = retryDelay(response.headers.get('retry-after'));
          const newToken = attempt === 0 && response.status === 429 && detail?.scope === 'minute' && retry > 0 && retry <= 60000 ? takeToken(c.id) : null;
          if (newToken) { clearTimeout(timer); await sleep(retry); token = newToken; continue; }
          recorded = {id:c.id, status:'recorded', httpStatus:response.status, error:safeLabel(detail?.error), complete:false, attempts:attempt+1};
          if (response.status === 429) halted = `Run stopped after rate limit (${safeLabel(detail?.scope)}); remaining cases were not requested.`;
          break;
        }
        if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
          recorded = {id:c.id, status:'recorded', error:'invalid-stream-response', complete:false}; break;
        }
        recorded = {id:c.id, status:'recorded', httpStatus:response.status, ...await readSse(response.body), attempts:attempt+1};
        break;
      } catch (error) {
        recorded = {id:c.id, status:'recorded', ...(error.partial || {}), complete:false, error:controller.signal.aborted ? 'request-timeout' : 'network-error'};
        break;
      } finally { clearTimeout(timer); }
    }
    records.push({...recorded, latencyMs:Date.now()-started});
    console.log(`${c.id}: ${structuralChecks(c, recorded).status}`);
  }
  return {formatVersion:1, datasetHash, createdAt:new Date().toISOString(), mode:'live', endpoint:endpoint.href, records};
}

async function writeReport(run, output) {
  const base = path.resolve(output || path.join(fileURLToPath(new URL('./results/', import.meta.url)), new Date().toISOString().replace(/[:.]/g,'-')));
  await fs.mkdir(path.dirname(base), {recursive:true});
  await fs.writeFile(base+'.json', JSON.stringify(run,null,2)+'\n');
  await fs.writeFile(base+'.md', markdownReport(run)+'\n');
  console.log(`Saved ${base}.json and ${base}.md`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs([...argv]);
  if (args.help) { console.log('Usage: node eval/benchmark.mjs [plan|run|score] [--limit 1..40] [--id ID | --ids ID,ID] [--category NAME] [--out PREFIX]\nrun requires --live and a fresh TURNSTILE_TOKEN, --tokens JSON file, or explicit --testing-turnstile. Optional --endpoint URL --delay-ms 30000 --timeout-ms 90000.\nscore requires --input RUN.json --judgments SCORES.json.'); return; }
  if (args.command === 'score') {
    if (!args.input || !args.judgments) throw new Error('score requires --input and --judgments.');
    const run = JSON.parse(await fs.readFile(args.input,'utf8'));
    const judgments = JSON.parse(await fs.readFile(args.judgments,'utf8'));
    if (!Array.isArray(run.records)) throw new Error('Input needs a records array.');
    await writeReport(scoreRun(run, judgments), args.out); return;
  }
  const selected = selectCases({id:args.id, ids:args.ids, category:args.category, limit:Number(args.limit ?? (args.command === 'plan' ? 40 : 3))});
  if (!['plan','run'].includes(args.command)) throw new Error('Command must be plan, run, or score.');
  const run = args.command === 'run' ? await liveRun(selected,args) : {
    formatVersion:1, datasetHash, createdAt:new Date().toISOString(), mode:'plan (no network requests)',
    records:selected.map((c)=>({id:c.id,status:'not-run'})),
  };
  await writeReport(scoreRun(run),args.out);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode=1; });
}
