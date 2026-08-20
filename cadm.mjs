import { chromium, devices } from 'playwright';
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({...devices['iPhone 13']});
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
await p.goto('https://sharpftc.pages.dev/cad',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(()=>({
  hScroll:document.documentElement.scrollWidth>window.innerWidth+2,
  h1:document.querySelectorAll('h1').length,
  canvas:!!document.querySelector('.cad__stage canvas'),
  stageW:Math.round(document.querySelector('.cad__stage').getBoundingClientRect().width)}))));
console.log('errors: '+(errs.join(';')||'clean'));
await b.close();
