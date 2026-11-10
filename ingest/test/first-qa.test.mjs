import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicBoard,chunksFromPublicAnswers} from '../src/sources/first-qa.js';
const url='https://game-qa.firstinspires.org/boards/2027/FTC/QA';
const item={number:1,questionId:'public-q',status:'ANSWERED',title:'A public rule question',content:'<p>May this device be used?</p>',rule:'R100',topic:'12',
  author:{email:'must-not-be-retained@example.invalid'},answer:{questionId:'public-q',content:'<p>See the applicable construction rule.</p>',modifiedAt:1790000000000}};
const data=(changes={})=>({board:{name:'Team',slug:'QA',config:{isPublic:true},season:{program:'FTC',cmpYear:2027,yearString:'2026-2027',gameName:'BIOBUZZ'}},questions:[item,{...item,number:2,status:'ACCEPTED',answer:null}],...changes});
const html=(d)=>`<script>Object.assign(window, ${JSON.stringify(d)});</script>`;
test('only public answered FTC Team records become summarize-only chunks',()=>{
  const cache=parsePublicBoard(html(data()),url);assert.equal(cache.entries.length,1);
  assert.doesNotMatch(JSON.stringify(cache),/author|email|ACCEPTED|must-not-be-retained/);
  const [c]=chunksFromPublicAnswers(cache);assert.equal(c.canExcerpt,0);assert.equal(c.excerptMode,'summarize');assert.equal(c.sourceUrl,url+'/qa/1');
  assert.match(c.text,/OFFICIAL PUBLISHED ANSWER/);assert.match(c.text,/2026-2027/);assert.match(c.text,/Published answer updated:/);
});
test('private, volunteer, wrong-program, mismatched-season and external routes are rejected',()=>{
  const privateBoard=data();privateBoard.board.config.isPublic=false;
  const volunteer=data();volunteer.board.name='Volunteer';
  const frc=data();frc.board.season.program='FRC';
  for(const d of [privateBoard,volunteer,frc])assert.throws(()=>parsePublicBoard(html(d),url),/public FTC/);
  assert.throws(()=>parsePublicBoard(html(data()),url.replace('2027','2026')),/season/);
  assert.throws(()=>parsePublicBoard(html(data()),url.replace('game-qa.firstinspires.org','attacker.invalid')),/official/);
});
test('empty, malformed, mismatched and duplicate answers preserve the previous cache by failing',()=>{
  assert.throws(()=>parsePublicBoard('login required',url),/missing/);
  assert.throws(()=>parsePublicBoard(html(data({questions:[]})),url),/No published/);
  assert.throws(()=>parsePublicBoard(html(data({questions:[item,item]})),url),/duplicate/);
  assert.throws(()=>parsePublicBoard(html(data({questions:[{...item,answer:{...item.answer,questionId:'wrong'}}]})),url),/Invalid/);
});

test('verified Q&A version survives public manifest mapping without copying answer or account data',async()=>{
  const {publicQaVersion,meta}=await import('../src/sources/first-qa.js');
  const {sourceManifestRow}=await import('../src/lib/corpus-metadata.js');
  const version=publicQaVersion({season:'2026-2027'});
  const row=sourceManifestRow({...meta,version},42);
  assert.equal(row.version,'2026-2027 official Team Q&A');assert.equal(row.mode,'summarize');
  assert.doesNotMatch(JSON.stringify(row),/questionId|author|account|answer|content/);
  assert.throws(()=>publicQaVersion({season:'unknown'}),/verified/);
  assert.throws(()=>sourceManifestRow({...meta,version:{}},42),/invalid source version/);
  const cache=parsePublicBoard(html(data()),url);cache.entries[0].url='https://attacker.invalid/private';
  assert.throws(()=>chunksFromPublicAnswers(cache),/Invalid published/);
});
