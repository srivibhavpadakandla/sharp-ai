import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cacheFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../vendor/first-qa/answered.json');

export function publicQaVersion(cache) {
  if (!/^\d{4}-\d{4}$/.test(cache?.season || '')) throw new Error('Q&A source has no verified season metadata.');
  return `${cache.season} official Team Q&A`;
}

export const meta = {
  sourceId:'first-qa', sourceName:'FIRST Official Team Q&A',
  homepage:'https://game-qa.firstinspires.org/',
  license:'FIRST copyright — public rulings summarised, never reproduced',licenseUrl:null,
  attribution:'FIRST Game Q&A — public answered Team board rulings only — paraphrased, not reproduced',
  canExcerpt:false,summarizeOnly:true,priority:1,
  get version() {
    if (!fs.existsSync(cacheFile)) return undefined;
    return publicQaVersion(JSON.parse(fs.readFileSync(cacheFile,'utf8')));
  },
};

const textOf = (html) => String(html || '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
  .replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|li|div|h[1-6])>/gi,'\n')
  .replace(/<[^>]*>/g,'')
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,(s)=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[s]))
  .replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();

/** Read the server's public JSON data without executing any page JavaScript. */
export function parsePublicBoard(html, boardUrl) {
  const url=new URL(boardUrl);
  if(url.origin!=='https://game-qa.firstinspires.org'||!/^\/boards\/\d{4}\/FTC\/QA$/.test(url.pathname))throw new Error('Only the official public FTC Team board is allowed.');
  const match=html.match(/Object\.assign\(window,\s*(\{[^\n]+\})\);/);
  if(!match)throw new Error('Public Q&A board data is missing.');
  const data=JSON.parse(match[1]);
  const board=data.board;
  if(board?.config?.isPublic!==true||board?.season?.program!=='FTC'||board.slug!=='QA'||board.name!=='Team')throw new Error('Q&A board is not an explicitly public FTC Team board.');
  if(String(board.season.cmpYear)!==url.pathname.split('/')[2])throw new Error('Q&A board season does not match its URL.');
  const seen=new Set();
  const entries=[];
  for(const q of data.questions || []) {
    if(q.status!=='ANSWERED'||!q.answer?.content)continue;
    if(!Number.isInteger(q.number)||q.number<1||seen.has(q.number)||q.answer.questionId!==q.questionId)throw new Error('Invalid or duplicate published Q&A record.');
    seen.add(q.number);
    const question=textOf(q.content), answer=textOf(q.answer.content), title=textOf(q.title);
    if(!title||!question||!answer)throw new Error('Published Q&A has missing question or answer text.');
    const modified=q.answer.modifiedAt||q.answer.createdAt||q.modifiedAt;
    if(!Number.isFinite(modified))throw new Error('Published Q&A has no valid answer timestamp.');
    entries.push({number:q.number,title,question,answer,rule:textOf(q.rule),topic:textOf(q.topic),
      season:board.season.yearString,url:`${url.origin}${url.pathname}/qa/${q.number}`,updatedAt:new Date(modified).toISOString()});
  }
  if(!entries.length)throw new Error('No published answers; previous Q&A cache must be preserved.');
  return {boardUrl:url.href,season:board.season.yearString,game:board.season.gameName,
    refreshedAt:new Date().toISOString(),entries:entries.sort((a,b)=>a.number-b.number)};
}

export function chunksFromPublicAnswers(cache) {
  if(!cache?.entries?.length||!/^\d{4}-\d{4}$/.test(cache.season||''))throw new Error('Invalid public Q&A cache.');
  const board=new URL(cache.boardUrl);
  if(board.origin!=='https://game-qa.firstinspires.org'||!/^\/boards\/\d{4}\/FTC\/QA$/.test(board.pathname))throw new Error('Invalid public Q&A cache board.');
  const ids=new Set();
  for(const entry of cache.entries){
    if(!Number.isInteger(entry.number)||entry.number<1||ids.has(entry.number)||entry.url!==`${board.href}/qa/${entry.number}`
      ||typeof entry.question!=='string'||!entry.question.trim()||typeof entry.answer!=='string'||!entry.answer.trim()
      ||!Number.isFinite(Date.parse(entry.updatedAt)))throw new Error('Invalid published Q&A cache entry.');
    ids.add(entry.number);
  }
  return cache.entries.map((entry,i)=>({
    sourceId:meta.sourceId,sourceName:meta.sourceName,docPath:`${cache.season}/qa/${entry.number}`,
    pageTitle:`${cache.season} Q${entry.number}: ${entry.title}`,sectionTitle:entry.title,
    headingPath:`FIRST Team Q&A > ${cache.season} > Q${entry.number}${entry.rule ? ` > ${entry.rule}`:''}`,
    anchor:'',sourceUrl:entry.url,category:'rules',license:meta.license,canExcerpt:0,excerptMode:'summarize',
    text:`# FIRST Official Team Q&A\n## ${cache.season} Q${entry.number}: ${entry.title}\nPublished answer updated: ${entry.updatedAt}${entry.rule ? `\nReferenced rule: ${entry.rule}`:''}\n\nQUESTION\n${entry.question}\n\nOFFICIAL PUBLISHED ANSWER\n${entry.answer}`,
    ordinal:i,part:0,partCount:1,
  }));
}

export function loadChunks() {
  const file=path.join(process.cwd(),'vendor','first-qa','answered.json');
  if(!fs.existsSync(file))throw new Error('Run node scripts/crawl-first-qa.mjs to fetch the public answered Team Q&A.');
  return chunksFromPublicAnswers(JSON.parse(fs.readFileSync(file,'utf8')));
}
