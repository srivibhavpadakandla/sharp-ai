import { chromium, devices } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-srivibhavp/9fd27bbe-1122-4a72-9a05-3c8f4c69fe6a/scratchpad/shots';
const U='https://4a62a65d.sharp-ai-8a1.pages.dev';
const b=await chromium.launch();
const p=await b.newPage({...devices['iPhone 13'], deviceScaleFactor:2});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,90)));
for (const [path,name] of [['/','home'],['/path','planner'],['/browse','browse']]) {
  await p.goto(U+path,{waitUntil:'networkidle',timeout:90000});
  await p.waitForTimeout(2200);
  const r = await p.evaluate(()=>({
    overflowX: document.documentElement.scrollWidth > innerWidth+1,
    scrollW: document.documentElement.scrollWidth, inner: innerWidth,
  }));
  console.log(name, JSON.stringify(r));
  await p.screenshot({path:`${OUT}/m-${name}.png`});
}
console.log('errors:',[...new Set(errs)]);
await b.close();
