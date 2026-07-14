import { chromium } from 'playwright';

const OUT = '/home/pgrunner/shots';
const BASE = 'http://127.0.0.1:7005';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const targets = [
  { name: 'library-desktop', url: '/library', w: 1440, h: 1100, full: true },
  { name: 'library-mobile', url: '/library', w: 390, h: 844 },
  { name: 'feed-desktop', url: '/', w: 1440, h: 900 },
  { name: 'feed-mobile', url: '/', w: 390, h: 900 },
];

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
for (const tsp of ['default', 'light']) {
  for (const t of targets) {
    const ctx = await browser.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript((style) => {
      try {
        localStorage.setItem('rmh-style', style);
        localStorage.setItem('rmh-lang-picked-v1', '1');
        localStorage.setItem('rmh:lang-picked', '1');
        localStorage.setItem('rmh-welcome-seen-v1', '1');
        localStorage.setItem('rmh-whatsnew-seen-v2', '1');
        localStorage.setItem('rmh-freemonth-snooze', String(Date.now() + 1e12));
        localStorage.setItem('rmh-cookie-consent', 'accepted');
        localStorage.setItem('rmh:cookie-consent', 'accepted');
      } catch {}
    }, tsp);
    try {
      await page.goto(BASE + t.url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch { try { await page.goto(BASE + t.url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {} }
    await page.waitForTimeout(1500);
    const file = `${OUT}/${tsp}-${t.name}.png`;
    await page.screenshot({ path: file, fullPage: !!t.full });
    console.log('shot', file);
    await ctx.close();
  }
}
await browser.close();
console.log('done');
