import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

async function answer(question, source) {
  const chunk = {chunkId:'fixture:rule',sourceId:source,sourceName:source==='first-manual'?'FTC Competition Manual':source==='first-qa'?'FIRST Official Team Q&A':'Game Manual 0',pageTitle:'Robot construction',sectionTitle:'Starting size',headingPath:'Robot > Starting size',sourceUrl:'https://example.org/manual',text:'The robot starting configuration fits within an 18 inch cube. Preloaded scoring elements may extend outside the starting size constraint.',canExcerpt:0,excerptMode:'summarize',score:20,category:'rules',license:'FIRST copyright'};
  const pending=[],kv=new Map();
  const env={REQUIRE_TURNSTILE:'false',AGENTIC:'false',GEMINI_API_KEY:'test',AI:{run:async()=>({data:[Array(768).fill(.1)]})},VECTORIZE:{query:async()=>({matches:[{id:chunk.chunkId,score:.95}]})},RATE:{get:async k=>kv.get(k)||null,put:async(k,v)=>kv.set(k,v)},CACHE:{get:async()=>null,put:async()=>{}},DB:{prepare(){const s={bind:()=>s,all:async()=>({results:[chunk]}),first:async()=>null,run:async()=>({})};return s;}}};
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'===GROUNDED===\nThe ROBOT must fit within an 18 inch cube; the cited rule explicitly exempts preloaded scoring elements [1].\n\n===BEYOND===\nUNVERIFIED SUGGESTION: include every preloaded element in that cube.'}]}}]})+'\n\n');
  try {const response=await worker.fetch(new Request('https://example.org/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question,learning:{mode:'explain',files:[]}})}),env,{waitUntil:p=>pending.push(p)});const body=await response.text();await Promise.all(pending);return body;}finally{globalThis.fetch=original;}
}

test('rules answers do not expose speculative suggestions that contradict a cited exception',async()=>{
  for (const source of ['first-manual','first-qa']) {
    const stream=await answer('What is the legal starting size for BIOBUZZ?',source);
    assert.match(stream,/explicitly exempts preloaded scoring elements/);
    assert.doesNotMatch(stream,/UNVERIFIED SUGGESTION|event: beyond/);
    assert.match(stream,/event: done/);
  }
});
test('ordinary engineering questions retain their clearly labeled suggestion lane',async()=>{
  assert.match(await answer('How can I design a mechanism?','gm0'),/event: beyond/);
});
