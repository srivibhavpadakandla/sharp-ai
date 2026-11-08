import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cases} from './cases.mjs';
import {parseSse, readSse, structuralChecks, scoreRun, markdownReport, retryDelay, selectCases, main} from './benchmark.mjs';

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const source = {n:1,chunkId:'sdk:one',sourceName:'FTC SDK',url:'https://ftc-docs.firstinspires.org/'};
const response = frame('meta',{citations:[source],excerpts:[{n:1,text:'Real source text.'}]})
  + frame('token',{t:'The motor command uses a configured device [1].'})
  + frame('beyond',{t:'An engineering suggestion.'})
  + frame('evidence',{claims:[{claim:'The motor command uses a configured device.',sources:[1]}]})
  + frame('done',{});
const record = (id='java-01') => ({id,status:'recorded',...parseSse(response)});
const judgments = {'java-01':{correctness:3,usefulness:4,citationSupport:3,rationale:'Reviewed the answer against the cited section.'}};

test('dataset contains 40 distinct synthetic scenarios and complete review criteria',()=>{
  assert.equal(cases.length,40);assert.equal(new Set(cases.map(c=>c.id)).size,40);
  assert.equal(new Set(cases.map(c=>c.category)).size,7);
  for(const c of cases){
    assert.match(c.origin,/synthetic/);assert.ok(c.expectedBehaviors.length);assert.ok(c.unacceptableClaims.length);
    for(const d of ['correctness','usefulness','citationSupport'])assert.match(c.rubric[d],/0/);
    if(c.sourceRequirements.required)assert.ok(c.sourceRequirements.reviewerLinks.length);
  }
});
test('SSE parser preserves answer, uncited reasoning, citations, excerpts, and evidence',()=>{
  const r=parseSse(response.replace(/\n/g,'\r\n'));
  assert.match(r.answer,/configured/);assert.match(r.beyond,/suggestion/);
  assert.equal(r.citations[0].n,1);assert.equal(r.excerpts.length,1);assert.equal(r.evidence.length,1);assert.equal(r.complete,true);
});
test('stream reader handles UTF-8 and CRLF boundaries split one byte at a time',async()=>{
  const text=frame('token',{t:'Réglage ⚙'}).replace(/\n/g,'\r\n')+frame('done',{});
  const bytes=new TextEncoder().encode(text);let i=0;
  const stream=new ReadableStream({pull(c){if(i===bytes.length)c.close();else c.enqueue(bytes.slice(i,i++ +1));}});
  assert.equal((await readSse(stream)).answer,'Réglage ⚙');
});
test('malformed frames do not invent an answer or terminal event',()=>{
  const r=parseSse('event: token\ndata: {bad\n\n');assert.equal(r.answer,'');assert.equal(r.complete,false);
  assert.equal(structuralChecks(cases[0],r).status,'failed');
});
test('a source-only fallback remains an explicit failure even if it emits done',()=>{
  const r=parseSse(frame('degrade',{reason:'llm-quota',answerMd:'Read this section.'})+frame('done',{}));
  assert.equal(r.fallbackAnswer,'Read this section.');assert.equal(r.degraded,true);
  const checks=structuralChecks(cases[0],r);assert.equal(checks.status,'failed');assert.match(checks.failures.join(' '),/fallback/);
});
test('missing citations and invalid references fail structure; Java array indexing does not',()=>{
  assert.equal(structuralChecks(cases[0],{...record(),citations:[]}).status,'failed');
  assert.match(structuralChecks(cases[0],{...record(),answer:'Wrong reference [8].'}).failures.join(' '),/\[8\]/);
  assert.equal(structuralChecks(cases[0],{...record(),answer:'Use `motors[0]` or motors[0].'}).status,'ready-for-review');
});
test('successful transport never creates an automated quality score',()=>{
  const r=scoreRun({records:[record()]});assert.equal(r.summary.humanReviewed,0);
  assert.equal(r.summary.qualityEstablished,false);assert.equal(r.records[0].scores,null);
  assert.equal(r.records[0].reviewStatus,'awaiting-human-review');
});
test('human scores require rationale and all three dimensions; means exclude unreviewed cases explicitly',()=>{
  assert.throws(()=>scoreRun({records:[record()]},{'java-01':{correctness:4}}),/rationale/);
  const r=scoreRun({records:[record(),record('java-02')]},judgments);
  assert.equal(r.summary.humanReviewed,1);assert.equal(r.summary.pending,1);assert.equal(r.summary.qualityEstablished,false);
  assert.equal(r.summary.reviewedOnlyMeans.correctness,3);
});
test('human success requires all dimensions at least three, and failed streams cannot receive scores',()=>{
  const passed=scoreRun({records:[record()]},judgments);assert.equal(passed.summary.qualityEstablished,true);
  const failed=scoreRun({records:[record()]},{'java-01':{...judgments['java-01'],correctness:2}});
  assert.equal(failed.summary.failures,1);
  const transport=scoreRun({records:[{...record(),degraded:true}]},judgments);
  assert.equal(transport.summary.humanReviewed,0);assert.equal(transport.summary.failures,1);
});
test('unknown and duplicate case IDs cannot inflate the score',()=>{
  assert.throws(()=>scoreRun({records:[record('bogus')]}),/Unknown/);
  assert.throws(()=>scoreRun({records:[record(),record()]}),/Duplicate/);
});
test('report includes expected behavior, disallowed claims, reviewer links, and honest incomplete status',()=>{
  const report=markdownReport(scoreRun({createdAt:'test',mode:'fixture',records:[record()]}));
  for(const text of ['synthetic','not been established','Expected behaviors','Unacceptable claims','Human scores','unreviewed','Returned sources','Evidence event'])assert.ok(report.includes(text),text);
});
test('retry-after supports seconds and HTTP dates without inventing a delay',()=>{
  assert.equal(retryDelay('60'),60000);assert.equal(retryDelay('bad'),0);assert.equal(retryDelay(null),0);
  assert.equal(retryDelay('Thu, 01 Jan 1970 00:01:00 GMT',0),60000);assert.equal(retryDelay('-2'),0);
});
test('case selection is bounded and live requests always require explicit opt-in',async()=>{
  assert.equal(selectCases().length,3);assert.equal(selectCases({category:'diagnostics',limit:40}).length,4);
  assert.throws(()=>selectCases({limit:41}),/1 to 40/);assert.throws(()=>selectCases({id:'missing'}),/No matching/);
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Network must not be reached.');};
  try{await assert.rejects(()=>main(['run','--limit','1']),/require run --live/);}finally{globalThis.fetch=original;}
});
test('real single-use tokens cannot be silently reused across cases',async()=>{
  const original=process.env.TURNSTILE_TOKEN;process.env.TURNSTILE_TOKEN='not-a-real-secret';
  try{await assert.rejects(()=>main(['run','--live','--limit','2']),/single-use/);}finally{
    if(original===undefined)delete process.env.TURNSTILE_TOKEN;else process.env.TURNSTILE_TOKEN=original;
  }
});
test('reader preserves a partial response on disconnection',async()=>{
  let sent=false;
  const stream=new ReadableStream({pull(c){if(!sent){sent=true;c.enqueue(new TextEncoder().encode(frame('token',{t:'Partial answer'})));}else c.error(new Error('network'));}});
  await assert.rejects(()=>readSse(stream),(error)=>error.partial.answer==='Partial answer'&&!error.partial.complete);
});

test('dataset drift and unknown judgment IDs are explicit errors',()=>{
  assert.throws(()=>scoreRun({datasetHash:'old-version',records:[record()]}),/Dataset changed/);
  assert.throws(()=>scoreRun({records:[record()]},{bogus:{}}),/Unknown judgment/);
});

test('a live-run fixture uses fresh tokens on retry and never stores either token',async()=>{
  const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sharp-eval-test-'));
  const tokenFile=path.join(dir,'tokens.json');const out=path.join(dir,'run');
  await fs.writeFile(tokenFile,JSON.stringify({'java-01':['first-private-token','second-private-token']}));
  const original=globalThis.fetch;const used=[];
  globalThis.fetch=async(_url,options)=>{
    used.push(JSON.parse(options.body).turnstileToken);
    if(used.length===1)return Response.json({error:'rate-limited',scope:'minute'},{status:429,headers:{'retry-after':'0.001'}});
    return new Response(response,{headers:{'content-type':'text/event-stream'}});
  };
  try{
    await main(['run','--live','--id','java-01','--limit','1','--tokens',tokenFile,'--out',out]);
    assert.deepEqual(used,['first-private-token','second-private-token']);
    const raw=await fs.readFile(out+'.json','utf8');const saved=JSON.parse(raw);
    assert.equal(saved.records[0].attempts,2);assert.equal(saved.records[0].reviewStatus,'awaiting-human-review');
    assert.doesNotMatch(raw,/first-private-token|second-private-token/);
  }finally{globalThis.fetch=original;await fs.rm(dir,{recursive:true,force:true});}
});

test('every scenario carries a private learning context accepted by the Worker',async()=>{
  const {normalizeLearning}=await import('../worker/src/learning.js');
  for(const c of cases){
    assert.ok(c.learning, c.id);
    assert.ok(Array.isArray(c.learning.files), c.id);
    assert.equal(normalizeLearning(c.learning).mode,c.learning.mode,c.id);
  }
  assert.deepEqual(cases.find(c=>c.id==='mechanical-01').learning,{mode:'explain',files:[]});
});

test('representative case IDs are explicit and invalid selections cannot silently run another set',()=>{
  const ids='java-02,mechanical-01,auto-04,rules-01,tutor-01,diagnostic-02';
  const selected=selectCases({ids,limit:6});
  assert.equal(selected.length,6);assert.equal(new Set(selected.map(c=>c.category)).size,6);
  assert.throws(()=>selectCases({ids:'java-01,missing',limit:6}),/distinct known/);
  assert.throws(()=>selectCases({ids:'java-01,java-01',limit:6}),/distinct known/);
  assert.throws(()=>selectCases({id:'java-01',ids:'java-02'}),/not both/);
});

test('plain-question live fixtures still transmit an explicit private context',async()=>{
  const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sharp-eval-private-'));
  const original=globalThis.fetch;let requestBody;
  globalThis.fetch=async(_url,options)=>{requestBody=JSON.parse(options.body);return new Response(response,{headers:{'content-type':'text/event-stream'}});};
  try{
    await main(['run','--live','--testing-turnstile','--id','mechanical-01','--limit','1','--out',path.join(dir,'run')]);
    assert.deepEqual(requestBody.learning,{mode:'explain',files:[]});
  }finally{globalThis.fetch=original;await fs.rm(dir,{recursive:true,force:true});}
});

test('evidence event claims retain exact passages, matching limits, and source versions',()=>{
  const claims=[{claim:'Use the configured name.',sources:[{n:1,status:'matched',passage:'The exact source passage.',version:'FTC SDK 12.0.0'}]}];
  const parsed=parseSse(frame('evidence',{claims})+frame('done',{}));
  assert.deepEqual(parsed.evidence,[{claims}]);
  const report=markdownReport(scoreRun({mode:'fixture',records:[{...record(),evidence:parsed.evidence}]}));
  assert.match(report,/The exact source passage/);assert.match(report,/FTC SDK 12.0.0/);
});

test('response privacy and guided troubleshooting metadata are preserved, and shared-cache replies fail',()=>{
  const tutor={mode:'diagnose',diagnostic:{question:'Does it move in a hardware test?'},followUps:['It moves.']};
  const parsed=parseSse(frame('meta',{citations:[source],privateContext:true,cached:false,tutor})+frame('token',{t:'Check this [1].'})+frame('done',{}));
  assert.deepEqual(parsed.tutor,tutor);assert.equal(parsed.privateContext,true);
  assert.equal(structuralChecks(cases[0],parsed).status,'ready-for-review');
  assert.equal(structuralChecks(cases[0],{...parsed,cached:true}).status,'failed');
});

test('model judgments remain provisional and never count as human validation',()=>{
  const model={'java-01':{...judgments['java-01'],reviewerType:'model'}};
  const r=scoreRun({mode:'fixture',records:[record()]},model);
  assert.equal(r.records[0].reviewerType,'model');assert.equal(r.records[0].reviewStatus,'passed-model-review');
  assert.equal(r.summary.modelReviewed,1);assert.equal(r.summary.humanReviewed,0);
  assert.equal(r.summary.passed,0);assert.equal(r.summary.provisionalModelPassed,1);
  assert.equal(r.summary.pending,1);assert.equal(r.summary.qualityEstablished,false);
  assert.equal(r.summary.reviewedOnlyMeans,null);assert.equal(r.summary.modelOnlyMeans.correctness,3);
  const report=markdownReport(r);
  assert.match(report,/Model reviewed \(provisional\): 1/);assert.match(report,/Human reviewed: 0/);
  assert.match(report,/Model-only means \(provisional/);assert.match(report,/Model scores \(0–4, provisional/);
  assert.match(report,/not been established/);assert.doesNotMatch(report,/Every recorded case passed human review/);
});

test('human and model means remain separate in a mixed run',()=>{
  const r=scoreRun({records:[record(),record('java-02')]},{
    'java-01':{...judgments['java-01'],reviewerType:'human'},
    'java-02':{correctness:1,usefulness:2,citationSupport:1,rationale:'Provisional model assessment.',reviewerType:'model'},
  });
  assert.equal(r.summary.humanReviewed,1);assert.equal(r.summary.modelReviewed,1);
  assert.equal(r.summary.reviewedOnlyMeans.correctness,3);assert.equal(r.summary.modelOnlyMeans.correctness,1);
  assert.equal(r.summary.failures,1);assert.equal(r.summary.pending,1);assert.equal(r.summary.qualityEstablished,false);
  assert.equal(r.records[1].reviewStatus,'failed-model-review');
});

test('reviewer type is validated, legacy manual usage defaults to human, and re-scoring clears old attribution',()=>{
  assert.throws(()=>scoreRun({records:[record()]},{'java-01':{...judgments['java-01'],reviewerType:'bot'}}),/reviewerType/);
  const human=scoreRun({records:[record()]},judgments);assert.equal(human.records[0].reviewerType,'human');
  assert.equal(human.summary.qualityEstablished,true);
  const cleared=scoreRun(human,{});assert.equal(cleared.records[0].reviewerType,null);assert.equal(cleared.records[0].rationale,null);
  assert.equal(cleared.summary.humanReviewed,0);assert.equal(cleared.summary.qualityEstablished,false);
});
