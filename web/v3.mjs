import { chromium } from 'playwright';
const OUT = '/private/tmp/claude-501/-Users-srivibhavp/9fd27bbe-1122-4a72-9a05-3c8f4c69fe6a/scratchpad/shots';
const U = 'https://8d6da867.sharp-ai-8a1.pages.dev';
const b = await chromium.launch();
for (const w of [1440, 1180, 1024]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 90)));
  await p.goto(U + '/', { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(4000);
  const probe = () => p.evaluate(() => {
    const cards = [...document.querySelectorAll('.scatter__card')];
    const hit = (a, o) => a.left < o.right && a.right > o.left && a.top < o.bottom && a.bottom > o.top;
    const copy = ['.hero__title','.hero__lede','.hero__actions']
      .map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
    let visibleOverCopy = 0, offscreen = 0, shown = 0;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const op = parseFloat(getComputedStyle(c).opacity);
      if (op > 0.06) shown++;
      if (op > 0.06 && copy.some(t => hit(r, t))) visibleOverCopy++;
      if (r.left < -4 || r.right > innerWidth + 4) offscreen++;
    }
    return { total: cards.length, shown, visibleOverCopy, offscreen };
  });
  // sample across the orbit, so a transient collision cannot slip past
  const samples = [];
  for (let i = 0; i < 4; i++) { samples.push(await probe()); await p.waitForTimeout(2200); }
  const worst = samples.reduce((a, s) => ({
    total: s.total, shown: Math.max(a.shown, s.shown),
    visibleOverCopy: Math.max(a.visibleOverCopy, s.visibleOverCopy),
    offscreen: Math.max(a.offscreen, s.offscreen),
  }), { shown: 0, visibleOverCopy: 0, offscreen: 0 });
  console.log(w, JSON.stringify(worst), errs.slice(0, 2));
  await p.screenshot({ path: `${OUT}/fade-${w}.png` });
  await p.close();
}
await b.close();
