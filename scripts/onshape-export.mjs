#!/usr/bin/env node
/**
 * Pull a glTF export straight out of Onshape into web/public/cad/.
 *
 * Onshape's API is keyed per developer, so this is not run in CI and no secret
 * lives in the repo — export ONSHAPE_ACCESS_KEY and ONSHAPE_SECRET_KEY from keys
 * made at https://dev-portal.onshape.com, then:
 *
 *   node scripts/onshape-export.mjs <onshape document url> "Chassis v4"
 *
 * The document URL is the one in the browser address bar with the tab open.
 * Authentication is HTTP Basic with the key pair, which is what Onshape's API
 * keys are for; OAuth is only needed for acting on behalf of other users.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../web/public/cad');
const BASE = 'https://cad.onshape.com/api/v10';

const [urlArg, nameArg] = process.argv.slice(2);
if (!urlArg) {
  console.error('usage: node scripts/onshape-export.mjs <document url> [name]');
  process.exit(2);
}
const { ONSHAPE_ACCESS_KEY: key, ONSHAPE_SECRET_KEY: secret } = process.env;
if (!key || !secret) {
  console.error('Set ONSHAPE_ACCESS_KEY and ONSHAPE_SECRET_KEY (dev-portal.onshape.com).');
  process.exit(2);
}

// .../documents/<did>/w/<wid>/e/<eid>
const m = urlArg.match(/documents\/([0-9a-f]+)\/(w|v|m)\/([0-9a-f]+)\/e\/([0-9a-f]+)/i);
if (!m) { console.error('That does not look like an Onshape document URL.'); process.exit(2); }
const [, did, wvm, wid, eid] = m;

const auth = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
const get = async (path, accept = 'application/json') => {
  const res = await fetch(BASE + path, { headers: { Authorization: auth, Accept: accept } });
  if (!res.ok) throw new Error(`${res.status} ${path} — ${(await res.text()).slice(0, 200)}`);
  return res;
};

// Assemblies and Part Studios have different export paths; ask which this is.
const elements = await (await get(`/documents/d/${did}/${wvm}/${wid}/elements?elementId=${eid}`)).json();
const type = (elements[0]?.elementType || 'PARTSTUDIO').toUpperCase();
const kind = type === 'ASSEMBLY' ? 'assemblies' : 'partstudios';
console.log(`element ${eid} is a ${type}`);

// The synchronous glTF endpoint: fewer knobs than the async translation job,
// but it returns the bytes directly instead of making us poll.
const res = await get(`/${kind}/d/${did}/${wvm}/${wid}/e/${eid}/gltf`, 'model/gltf-binary');
const buf = Buffer.from(await res.arrayBuffer());

const name = nameArg || `onshape-${eid.slice(0, 8)}`;
const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.glb`;
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, file), buf);

console.log(`wrote web/public/cad/${file}  (${(buf.length / 1e6).toFixed(2)} MB)`);
console.log(`Add to web/public/cad/manifest.json:  { "name": ${JSON.stringify(name)}, "file": ${JSON.stringify(file)} }`);
