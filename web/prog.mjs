import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('https://aaa51381.sharp-ai-8a1.pages.dev/',{waitUntil:'networkidle',timeout:90000});
await p.waitForTimeout(2000);
const info=await p.evaluate(()=>{const st=document.querySelector('[data-film-stage]');
  return {top:st.offsetTop, h:st.offsetHeight, vh:innerHeight};});
console.log('stage', JSON.stringify(info));
for (const f of [0,0.2,0.4,0.5,0.6,0.8,1.0]) {
  const range = info.h - info.vh;
  await p.evaluate(([t,f,r])=>scrollTo(0, t + f*r), [info.top, f, range]);
  await p.waitForTimeout(800);
  const d=await p.evaluate(()=>({prog:+(window.__morphProgress||0).toFixed(3),
    w:Math.round(document.querySelector('[data-morph]').getBoundingClientRect().width)}));
  console.log('scrollFrac',f,'timelineProgress',d.prog,'boxW',d.w);
}
await b.close();
