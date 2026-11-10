#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {SOURCES} from '../src/sources/index.js';
import {publicationPlan,sha} from '../src/publication.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!key.startsWith('--')||!process.argv[i+1])throw new Error('Options require --name value.');args[key.slice(2)]=process.argv[i+1];}
const fromRoot=(p)=>path.resolve(root,p);
const baseline=fromRoot(args.baseline || 'ingest/data/refresh-baseline');
const out=fromRoot(args.out || 'ingest/data/publication');
const ndjson=(p)=>fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const chunks=ndjson(fromRoot('ingest/data/chunks.ndjson'));
const vectors=ndjson(fromRoot('ingest/data/vectors.ndjson'));
const oldVectors=ndjson(path.join(baseline,'vectors.ndjson'));
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync(fromRoot('worker/sql/0000_schema.sql'),'utf8'));
db.exec(fs.readFileSync(path.join(baseline,'live-corpus.sql'),'utf8'));
const beforeSources=db.prepare('SELECT * FROM sources').all();
const beforeChunks=db.prepare('SELECT * FROM chunks').all();
const plan=publicationPlan({beforeSources,beforeChunks,chunks,vectors,metas:Object.values(SOURCES).map((s)=>s.meta),
  manifest:JSON.parse(fs.readFileSync(fromRoot('worker/src/lib/corpus-info.json'),'utf8')),
  beforeManifest:JSON.parse(fs.readFileSync(path.join(baseline,'corpus-info.json'),'utf8')),
  allowSourceLoss:(args['allow-source-loss']||'').split(',').filter(Boolean)});
const oldIds=new Set(beforeChunks.map((c)=>c.chunk_id));
if(oldVectors.length!==oldIds.size||oldVectors.some((v)=>!oldIds.has(v.id)||beforeChunks.find((c)=>c.chunk_id===v.id).content_hash!==v.metadata?.content_hash))throw new Error('Rollback vectors do not match actual live baseline chunk hashes.');
fs.mkdirSync(out,{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(out,name),value);
write('forward.sql',plan.forward.sql);write('rollback.sql',plan.rollback.sql);
write('vectors-upsert.ndjson',vectors.map(JSON.stringify).join('\n')+'\n');
write('vectors-rollback.ndjson',oldVectors.map(JSON.stringify).join('\n')+'\n');
write('vector-ids-retire.json',JSON.stringify(plan.forward.removed,null,2)+'\n');
write('vector-ids-rollback-retire.json',JSON.stringify(plan.rollback.removed,null,2)+'\n');
write('manifest-next.json',JSON.stringify(plan.manifest,null,2)+'\n');write('manifest-previous.json',JSON.stringify(plan.beforeManifest,null,2)+'\n');
const summary={...plan.summary,createdAt:new Date().toISOString(),counts:plan.validation.counts,previousCounts:plan.oldCounts,
  artifactHashes:Object.fromEntries(['forward.sql','rollback.sql','vectors-upsert.ndjson','vectors-rollback.ndjson','vector-ids-retire.json','vector-ids-rollback-retire.json'].map((name)=>[name,sha(fs.readFileSync(path.join(out,name)))]))};
write('plan.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
