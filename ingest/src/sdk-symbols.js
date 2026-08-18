#!/usr/bin/env node
/**
 * Build the FTC SDK symbol table used by the code validator.
 *
 *   npm run sdk-symbols
 *
 * Reads the `type-search-index.js` / `member-search-index.js` files that
 * javadoc ships inside the published javadoc jars, and emits the set of type,
 * method and constant NAMES. Names only — no documentation prose is copied;
 * this is an API surface for validation, not a corpus.
 *
 * Setup (once):
 *   mkdir -p vendor/sdk-javadoc && cd vendor/sdk-javadoc
 *   V=11.2.1
 *   for A in RobotCore Hardware FtcCommon Vision; do
 *     curl -sLO "https://repo1.maven.org/maven2/org/firstinspires/ftc/$A/$V/$A-$V-javadoc.jar"
 *     mkdir -p $A && (cd $A && unzip -oq "../$A-$V-javadoc.jar")
 *   done
 *
 * Why this matters: the previous allowlist was hand-assembled — 71 types and
 * 64 methods. The real surface is ~1300 types and ~3800 methods. A validator
 * built on the small list would have flagged almost every legitimate SDK call
 * as invented, which is far worse than having no validator at all.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../vendor/sdk-javadoc');
const OUT = path.resolve(here, '../../worker/src/lib/ftc-sdk-symbols.json');
const SDK_VERSION = process.env.FTC_SDK_VERSION || '11.2.1';

/** javadoc writes `var x = [ ... ];updateSearchResults();` — take the array. */
function readIndex(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const a = text.indexOf('[');
  const b = text.lastIndexOf(']');
  if (a === -1 || b === -1) return [];
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return []; }
}

if (!fs.existsSync(ROOT)) {
  console.error(`No javadoc at ${ROOT} — see the setup block at the top of this file.`);
  process.exit(1);
}

const types = new Set();
const methods = new Set();
const constants = new Set();
const packages = new Set();

const artifacts = fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory());

for (const art of artifacts) {
  for (const t of readIndex(path.join(ROOT, art, 'type-search-index.js'))) {
    if (t.l && /^[A-Z]/.test(t.l)) types.add(String(t.l).split('.').pop());
    if (t.p) packages.add(t.p);
  }
  for (const m of readIndex(path.join(ROOT, art, 'member-search-index.js'))) {
    if (!m.l) continue;
    const name = String(m.l).split('(')[0].trim();
    if (/^[a-z][A-Za-z0-9]*$/.test(name)) methods.add(name);
    else if (/^[A-Z][A-Z0-9_]{2,}$/.test(name)) constants.add(name);   // enum constants
  }
}

const payload = {
  note: 'FTC SDK API surface, extracted from published javadoc search indexes. '
    + 'Names only — no documentation text. Used by the code validator to flag '
    + 'symbols that are not part of the SDK. Unknown symbols are WARNINGS, never blocks.',
  sdkVersion: SDK_VERSION,
  artifacts,
  generatedAt: new Date().toISOString().slice(0, 10),
  counts: { types: types.size, methods: methods.size, constants: constants.size },
  types: [...types].sort(),
  methods: [...methods].sort(),
  constants: [...constants].sort(),
  packages: [...packages].sort(),
};

fs.writeFileSync(OUT, JSON.stringify(payload));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`[sdk-symbols] ${artifacts.join(', ')} @ ${SDK_VERSION}`);
console.log(`[sdk-symbols] ${types.size} types · ${methods.size} methods · ${constants.size} constants`);
console.log(`[sdk-symbols] -> ${path.relative(process.cwd(), OUT)} (${kb} KB)`);
