import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sha,chunkRow,sourceRows,validateCorpus,corpusDelta,publicationPlan} from '../src/publication.js';
import {EMBEDDING_DIM} from '../../worker/src/lib/query.js';
const meta={sourceId:'official',sourceName:'Official Docs',homepage:'https://example.org',license:'BSD',canExcerpt:true,priority:5};
const chunk=(id='a',text='A motor documentation section.')=>({chunkId:`official:${id}`,sourceId:'official',sourceName:'Official Docs',docPath:id,pageTitle:id,sectionTitle:id,headingPath:id,anchor:'',sourceUrl:`https://example.org/${id}`,category:'programming',license:'BSD',canExcerpt:1,excerptMode:'full',text,charLen:text.length,contentHash:sha(text),ordinal:0,part:0,partCount:1,updatedAt:'2026-11-09T00:00:00Z'});
const vector=(c)=>({id:c.chunkId,values:[1,...Array(EMBEDDING_DIM-1).fill(0)],metadata:{content_hash:c.contentHash,source_id:c.sourceId,category:c.category}});
const manifest=(chunks)=>({sections:chunks.length,sources:[{id:'official',sections:chunks.length}],epoch:sha(chunks.map(c=>JSON.stringify([c.chunkId,c.contentHash,c.sourceUrl,c.canExcerpt,c.excerptMode,c.license])).join('\n')).slice(0,16)});

test('vector/chunk mismatches, duplicates, nonfinite values and wrong model are refused',()=>{
  const c=chunk();assert.equal(validateCorpus([c],[vector(c)],[meta]).chunks,1);
  assert.throws(()=>validateCorpus([c],[],[meta]),/Missing/);
  assert.throws(()=>validateCorpus([c,c],[vector(c)],[meta]),/duplicate/);
  assert.throws(()=>validateCorpus([c],[{...vector(c),metadata:{...vector(c).metadata,content_hash:'old'}}],[meta]),/metadata/);
  const invalid=vector(c);invalid.values[0]=NaN;assert.throws(()=>validateCorpus([c],[invalid],[meta]),/values/);
  const wrong=vector(c);wrong.metadata.embedding_model='other-model';assert.throws(()=>validateCorpus([c],[wrong],[meta]),/metadata/);
});
test('unregistered/excluded sources and license escalation cannot enter a plan',()=>{
  const c=chunk();assert.throws(()=>validateCorpus([{...c,sourceId:'excluded',chunkId:'excluded:a'}],[],[meta]),/Unregistered/);
  assert.throws(()=>validateCorpus([c],[vector(c)],[{...meta,canExcerpt:false,summarizeOnly:true}]),/Restricted/);
  assert.throws(()=>validateCorpus([{...c,license:'changed'}],[vector(c)],[meta]),/provenance/);
});
test('link sources contain only their deterministic title/link record, never source body prose',()=>{
  const m={...meta,canExcerpt:false,linkOnly:true};const c={...chunk(),canExcerpt:0,excerptMode:'link'};
  c.text=`# ${c.sourceName}\n## ${c.headingPath}\n\n${c.sourceName} documents this at "${c.pageTitle}". The text of this page is not reproduced here; open the link to read it.`;
  c.charLen=c.text.length;c.contentHash=sha(c.text);assert.equal(validateCorpus([c],[vector(c)],[m]).chunks,1);
  const bad={...c,text:c.text+'\nCopied restricted prose.'};bad.charLen=bad.text.length;bad.contentHash=sha(bad.text);
  assert.throws(()=>validateCorpus([bad],[vector(bad)],[m]),/Link-only/);
});
test('forward and rollback preserve private tables, FTS integrity, and quoted text',()=>{
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../../worker/sql/0000_schema.sql',import.meta.url),'utf8'));
  db.exec("CREATE TABLE feedback (id TEXT PRIMARY KEY, content TEXT); INSERT INTO feedback VALUES ('private','retain');");
  db.exec("INSERT INTO answers(slug,question,question_norm,answer_md,citations,excerpts,source_ids,model,created_at,updated_at) VALUES ('private','retain','retain','retain','[]','[]','[]','fixture','now','now'); INSERT INTO query_log(ts,question,question_hash,question_len) VALUES ('now','retain','retain',6);");
  const old=[chunk('a'),chunk('remove')],fresh=[chunk('a',"Motor text with 'quotes'; DROP TABLE answers; is literal documentation."),chunk('new')];
  const sources=sourceRows([meta],'now');
  db.exec(corpusDelta([],[],sources,old.map(chunkRow)).sql);
  const protectedBefore=['answers','query_log','feedback'].map(t=>JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all()));
  const forward=corpusDelta(sources,old.map(chunkRow),sources,fresh.map(chunkRow));db.exec(forward.sql);
  assert.equal(db.prepare('SELECT count(*) n FROM chunks').get().n,2);
  assert.deepEqual(db.prepare('SELECT chunk_id FROM chunks ORDER BY chunk_id').all().map(r=>r.chunk_id),['official:a','official:new']);
  assert.equal(db.prepare("SELECT count(*) n FROM chunks_fts WHERE chunks_fts MATCH 'Motor'").get().n,2);
  const rollback=corpusDelta(sources,fresh.map(chunkRow),sources,old.map(chunkRow));db.exec(rollback.sql);
  assert.deepEqual(db.prepare('SELECT chunk_id,content_hash FROM chunks ORDER BY chunk_id').all().map(r=>[r.chunk_id,r.content_hash]),old.map(c=>[c.chunkId,c.contentHash]).sort());
  assert.deepEqual(['answers','query_log','feedback'].map(t=>JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all())),protectedBefore);
  assert.doesNotThrow(()=>db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('integrity-check')"));db.close();
});
test('same text with changed URL/license mode still yields a metadata update without reusing stale metadata',()=>{
  const c=chunk();const next={...c,sourceUrl:'https://example.org/new'};const rows=sourceRows([meta],'now');
  const d=corpusDelta(rows,[chunkRow(c)],rows,[chunkRow(next)]);assert.deepEqual(d.changed,['official:a']);assert.match(d.sql,/new/);
  const stamp={...c,updatedAt:'later'};assert.equal(corpusDelta(rows,[chunkRow(c)],rows,[chunkRow(stamp)]).unchanged,1);
});
test('plan refuses stale manifests and unexpected large source loss, and always stages all fresh vectors',()=>{
  const old=[chunk('a'),chunk('b'),chunk('c'),chunk('d'),chunk('e')],fresh=[chunk('a'),chunk('b'),chunk('c'),chunk('d')];
  const args={beforeSources:sourceRows([meta],'old'),beforeChunks:old.map(chunkRow),chunks:fresh,vectors:fresh.map(vector),metas:[meta],manifest:manifest(fresh),beforeManifest:{epoch:'old'}};
  assert.equal(publicationPlan(args).summary.vectorsToUpsert,4);
  assert.equal(publicationPlan(args).summary.crossStoreAtomic,false);
  assert.throws(()=>publicationPlan({...args,manifest:{...manifest(fresh),epoch:'stale'}}),/epoch/);
  assert.throws(()=>publicationPlan({...args,chunks:fresh.slice(0,2),vectors:fresh.slice(0,2).map(vector)}),/Incomplete|coverage/);
});
