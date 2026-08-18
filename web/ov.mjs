import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w,h] of [[1440,900],[1180,900],[820,900]]) {
  const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
  await p.goto('https://c7ebaf58.sharp-ai-8a1.pages.dev/path', { waitUntil:'networkidle', timeout:90000 });
  await p.waitForTimeout(2000);
  console.log(w, JSON.stringify(await p.evaluate(() => {
    const over = document.documentElement.scrollWidth > innerWidth + 1;
    const inputs = [...document.querySelectorAll('.sim__list input')];
    const clipped = inputs.filter(i => i.getBoundingClientRect().right > innerWidth + 1).length;
    const code = document.querySelector('.sim__code');
    return { pageOverflowX: over, clippedInputs: clipped, codeVisible: !!code && code.getBoundingClientRect().width > 50 };
  })));
  await p.close();
}
await b.close();
