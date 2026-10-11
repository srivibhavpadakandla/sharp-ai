import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './sources/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chunks = fs.readFileSync(path.join(root, 'ingest/data/chunks.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
const counts = chunks.reduce((all, c) => { all[c.sourceId] = (all[c.sourceId] || 0) + 1; return all; }, {});
const manual = fs.readFileSync(path.join(root, 'ingest/vendor/first-manual/manual.txt'), 'utf8');
const sdk = JSON.parse(fs.readFileSync(path.join(root, 'worker/src/lib/ftc-sdk-symbols.json'), 'utf8'));
const sources = Object.entries(SOURCES).map(([id, { meta }]) => {
  if (!counts[id]) throw new Error(`${id}: missing source in refreshed corpus`);
  return { id, name: meta.sourceName, sections: counts[id], homepage: meta.homepage,
    mode: meta.canExcerpt ? 'full' : meta.summarizeOnly ? 'summarize' : 'link' };
});
const info = { updatedAt: new Date().toISOString().slice(0, 10), sections: chunks.length,
  epoch: crypto.createHash('sha256').update(chunks.map((c) => JSON.stringify([c.chunkId, c.contentHash, c.sourceUrl, c.canExcerpt, c.excerptMode, c.license])).join('\n')).digest('hex').slice(0, 16),
  sdkVersion: sdk.sdkVersion, manualVersion: manual.match(/Version:\s*(\S+)/)?.[1] || 'unknown', sources };
fs.writeFileSync(path.join(root, 'worker/src/lib/corpus-info.json'), JSON.stringify(info, null, 2) + '\n');
const configPath = path.join(root, 'worker/wrangler.toml');
const config = fs.readFileSync(configPath, 'utf8').replace(/CORPUS_EPOCH\s*=\s*"[^"]+"/, `CORPUS_EPOCH     = "${info.updatedAt}-${info.epoch}"`);
fs.writeFileSync(configPath, config);
console.log(`[corpus] ${info.sections} sections, ${sources.length} sources, manual ${info.manualVersion}, SDK ${info.sdkVersion}`);
