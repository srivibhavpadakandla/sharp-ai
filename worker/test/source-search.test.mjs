import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keywordSearch, semanticSearch, retrieve} from '../src/retrieval.js';
import worker from '../src/index.js';

const rows = [
  {chunkId:'sdk:1',sourceId:'ftc-sdk-api',sourceName:'FTC SDK API',pageTitle:'DcMotor',sectionTitle:'Direction',headingPath:'DcMotor > Direction',sourceUrl:'https://example.org/sdk',text:'Motor direction controls forward and reverse motor power.',canExcerpt:1,excerptMode:'full',license:'BSD',score:20},
  {chunkId:'manual:1',sourceId:'first-manual',sourceName:'FTC Competition Manual',pageTitle:'Robot rules',sectionTitle:'Size',headingPath:'Robot > Size',sourceUrl:'https://example.org/manual',text:'Restricted original manual text.',canExcerpt:1,excerptMode:'summarize',license:'FIRST copyright',score:20},
];
function envFor({rogueSemantic=false}={}) {
  const calls=[];
  const env={AI:{run:async()=>({data:[Array(768).fill(0.1)]})},VECTORIZE:{query:async(_vector, options)=>{
    calls.push({vector:options});
    return {matches:rows.filter(r=>rogueSemantic || !options.filter || r.sourceId===options.filter.source_id).map(r=>({id:r.chunkId,score:0.9}))};
  }},DB:{prepare(sql){const statement={args:[],bind(...args){this.args=args;calls.push({sql,args});return this;},async all(){
    if(sql.includes('chunks_fts')) return {results:rows.filter(r=>!sql.includes('c.source_id = ?') || r.sourceId===this.args[1])};
    return {results:rows.filter(r=>this.args.includes(r.chunkId))};
  }};return statement;}}};
  return {env,calls};
}

test('source filtering binds D1 parameters and applies the same Vectorize metadata filter',async()=>{
  const {env,calls}=envFor();
  const keyword=await keywordSearch(env,'motor direction',24,'ftc-sdk-api');
  assert.deepEqual(keyword.map(r=>r.sourceId),['ftc-sdk-api']);
  assert.equal(calls[0].args[1], 'ftc-sdk-api');
  assert.equal(calls[0].args[2], 24);
  await semanticSearch(env,'motor direction',24,'ftc-sdk-api');
  assert.deepEqual(calls.find(c=>c.vector).vector.filter,{source_id:'ftc-sdk-api'});
});

test('hydrated results cannot leak another source if a vector provider ignores the filter',async()=>{
  const {env}=envFor({rogueSemantic:true});
  const result=await retrieve(env,'motor direction',{sourceId:'ftc-sdk-api'});
  assert.ok(result.chunks.length>0);
  assert.ok(result.chunks.every(r=>r.sourceId==='ftc-sdk-api'));
});

test('unknown source is rejected before retrieval',async()=>{
  const {env,calls}=envFor();
  const response=await worker.fetch(new Request('https://example.org/api/search?q=motor&source=unknown'),env,{});
  assert.equal(response.status,400);assert.equal(calls.length,0);
});

test('search returns source/version metadata and never reproduces summarize-only text',async()=>{
  const {env}=envFor();
  const response=await worker.fetch(new Request('https://example.org/api/search?q=robot%20size&source=first-manual'),env,{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.source,'first-manual');assert.ok(body.results.length);
  assert.ok(body.results.every(r=>r.sourceId==='first-manual'&&r.text===null&&r.canExcerpt===false));
  assert.equal(body.results[0].mode,'summarize');assert.ok(body.results[0].version);
  assert.ok(body.corpus.updatedAt);
});

test('source-scoped keyword fallback remains usable when the vector leg fails',async()=>{
  const {env}=envFor();env.VECTORIZE.query=async()=>{throw Error('temporary outage');};
  const result=await retrieve(env,'motor direction',{sourceId:'ftc-sdk-api'});
  assert.equal(result.stats.semanticFailed,true);
  assert.ok(result.chunks.length);assert.ok(result.chunks.every(r=>r.sourceId==='ftc-sdk-api'));
});
