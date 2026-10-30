// Scratch smoke: /csgo offline vs bots, assets proxied from production.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:7997';
const OUT = process.argv[3] ?? '/tmp/cs-smoke';
const MODE = process.argv[4] ?? 'de';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route('**/api/csgo-game/assets/**', async (route) => {
  const u = new URL(route.request().url());
  try {
    const res = await fetch('https://rmhstudios.com' + u.pathname + u.search);
    const body = Buffer.from(await res.arrayBuffer());
    await route.fulfill({ status: res.status, body, headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' } });
  } catch (e) {
    await route.fulfill({ status: 502, body: String(e) });
  }
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 400)));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`.slice(0, 600)));
await page.goto(BASE + '/csgo', { waitUntil: 'domcontentloaded', timeout: 180000 });
// Hydrated: the room list has asked the hub (its text leaves "Connecting…").
await page.waitForFunction(() => !document.body.textContent?.includes('Connecting…'), undefined, { timeout: 180000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/lobby.png` });
if (MODE === 'dm') await page.getByRole('radio', { name: 'Deathmatch' }).click();
for (let i = 0; i < 10; i++) {
  await page.getByRole('button', { name: 'Play offline' }).click();
  await page.waitForTimeout(3000);
  if (await page.locator('.tf2g-stage').count()) break;
}
const t0 = Date.now();
let phase = '';
while (Date.now() - t0 < 600000) {
  phase = await page.evaluate(() => document.querySelector('.tf2g-stage')?.getAttribute('data-phase') ?? '');
  if (phase === 'running' || phase === 'error') break;
  await page.waitForTimeout(2000);
}
const report = { phase, loadSeconds: (Date.now() - t0) / 1000 };
await page.screenshot({ path: `${OUT}/loaded.png` });
if (phase === 'running') {
  await page.mouse.click(640, 360);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/t${i}.png` });
  }
  report.debug = await page.evaluate(() => {
    const g = window.__rmhGame;
    try {
      return JSON.parse(JSON.stringify(g?.debug?.() ?? null));
    } catch (e) {
      return String(e);
    }
  });
  // Open the buy menu.
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/buy.png` });
  await page.keyboard.press('KeyB');
  await page.keyboard.down('Tab');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/scores.png` });
  await page.keyboard.up('Tab');
}
report.error = await page.evaluate(() => document.querySelector('.tf2g-play-screen')?.textContent?.slice(0, 600) ?? null);
report.logs = logs.slice(-60);
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ phase, loadSeconds: report.loadSeconds, error: report.error }, null, 1));
await browser.close();
