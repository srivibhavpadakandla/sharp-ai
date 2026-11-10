#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const argv=process.argv.slice(2);
if(!argv.includes('--remote'))throw new Error('Read-only remote snapshot requires --remote explicitly.');
const outArg=argv.indexOf('--out');if(outArg<0||!argv[outArg+1])throw new Error('Provide --out DIRECTORY.');
const out=path.resolve(root,argv[outArg+1]);
await fs.mkdir(out,{recursive:true});
const cli=path.join(root,'web/node_modules/.bin/wrangler');
const config=path.join(root,'worker/wrangler.toml');
const run=async(args)=>{
  try{return (await exec(cli,[...args,'--config',config],{cwd:root,maxBuffer:20*1024*1024,timeout:120000,env:{...process.env,NODE_USE_ENV_PROXY:process.env.NODE_USE_ENV_PROXY || '1'}})).stdout;}
  catch(error){throw new Error(`Read-only Cloudflare ${args.slice(0,2).join(' ')} failed (exit ${error.code ?? 'unknown'}); no credentials or response payload were logged.`);}
};
const json=(output)=>{
  try{return JSON.parse(output.trim());}catch{
    const start=output.search(/^[\[{]/m);if(start<0)throw new Error('Cloudflare returned no JSON.');
    return JSON.parse(output.slice(start).trim());
  }
};
const exportLog=await run(['d1','export','sharp-ai','--remote','--table','sources','--table','chunks','--no-schema','--output',path.join(out,'live-corpus.sql')]);
await fs.writeFile(path.join(out,'export.log'),exportLog.replace(/(https?:\/\/[^\s?]+)\?[^\s]+/g,'$1?[redacted]'));
const ids=[],seen=new Set();let cursor;
for(let page=0;page<100;page++){
  const result=json(await run(['vectorize','list-vectors','sharp-ai-chunks','--count','1000','--json',...(cursor?['--cursor',cursor]:[])]));
  for(const v of result.vectors||[]){if(seen.has(v.id))throw new Error('Duplicate vector ID in live pagination.');seen.add(v.id);ids.push(v.id);}
  if(!result.isTruncated){cursor=null;break;}cursor=result.nextCursor;if(!cursor)throw new Error('Truncated vector listing has no cursor.');
}
if(cursor||!ids.length)throw new Error('Live vector listing was incomplete or empty.');
await fs.writeFile(path.join(out,'live-vector-ids.json'),JSON.stringify(ids,null,2)+'\n');
const vectors=[];
// The get_by_ids endpoint accepts at most 20 IDs, even though list pages allow 1000.
for(let i=0;i<ids.length;i+=40){
  const batches=[];
  for(let offset=i;offset<Math.min(i+40,ids.length);offset+=20)batches.push(ids.slice(offset,offset+20));
  const responses=await Promise.all(batches.map(async(requested)=>{
    const batch=json(await run(['vectorize','get-vectors','sharp-ai-chunks','--ids',...requested]));
    if(!Array.isArray(batch)||batch.length!==requested.length||batch.some((v)=>!requested.includes(v.id)))throw new Error('Live vector snapshot omitted requested IDs.');
    return batch.map(({id,values,metadata,namespace})=>({id,values,metadata,...(namespace?{namespace}:{})}));
  }));
  vectors.push(...responses.flat());
  console.log(`[snapshot] ${vectors.length}/${ids.length} document vectors copied`);
}
await fs.writeFile(path.join(out,'vectors.ndjson'),vectors.map(JSON.stringify).join('\n')+'\n');
await fs.writeFile(path.join(out,'snapshot.json'),JSON.stringify({createdAt:new Date().toISOString(),tables:['sources','chunks'],vectors:vectors.length,privateTablesAccessed:false},null,2)+'\n');
console.log('Read-only corpus snapshot complete. Private student tables were not exported.');
