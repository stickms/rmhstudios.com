/**
 * Browser check for the procedural models (plan H2.4): opens `/?level=dev_models` of the bare
 * harness (`models-harness/serve.ts`: the Harmonic client without the site), starts the level and
 * screenshots the cast (the entity renderer drawing the trooper and the other models from the
 * procedural ModelLibrary).
 *
 *   pnpm exec tsx scripts/harmonic/models-harness/serve.ts 7405 &
 *   [CHROMIUM_PATH=/path/to/chrome] pnpm exec tsx scripts/harmonic/models-smoke.ts <out-dir> [base-url]
 *
 * Exits non-zero on a page error, a failed request, or a blank canvas. Drives the game through the
 * dev-only `window.__rmhGame` handle (`sv_cheats 1`, `setpos`, `setang`).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:7405';
if (!out) {
  console.error('usage: models-smoke.ts <out-dir> [base-url]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const command = (page: Page, name: string, ...args: number[]): Promise<void> =>
  page.evaluate(
    ([n, a]) => {
      const g = (window as unknown as { __rmhGame?: { store: { send(c: unknown): void } } })
        .__rmhGame;
      g?.store.send({ kind: 'extra', command: n, args: a });
    },
    [name, args] as [string, number[]],
  );

/** Share of non-dark pixels in a PNG. */
const litShare = (page: Page, png: Buffer): Promise<number> =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 72;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 128, 72);
    const d = ctx.getImageData(0, 0, 128, 72).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
    return lit / (128 * 72);
  }, png.toString('base64'));

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // Failed requests are reported (with the URL) by the response handler below.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      problems.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico'))
      problems.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${base}/?level=dev_models`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForSelector('canvas', { timeout: 90_000 });
  await page.waitForFunction(
    () => {
      const g = (
        window as unknown as { __rmhGame?: { debug?: () => { stats: { drawCalls: number } } } }
      ).__rmhGame;
      return (g?.debug?.().stats.drawCalls ?? 0) > 0;
    },
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1500);
  await command(page, 'sv_cheats', 1);
  // Views: [name, x, y, z, yaw, pitch]. The cast stands on the plinth at y 260, facing west.
  const views: Array<[string, number, number, number, number, number]> = [
    ['01-cast', 60, 262, 60, 0, 4],
    ['02-trooper', 150, 262, 60, 0, 2],
    ['03-shield-drifter', 340, 176, 60, 70, 3],
    ['04-ines-lind', 560, 176, 60, 100, 3],
    ['05-props', 420, 250, 60, 90, 5],
  ];
  let blank = 0;
  for (const [name, x, y, z, yaw, pitch] of views) {
    await command(page, 'setpos', x, y, z);
    await command(page, 'setang', pitch, yaw, 0);
    await page.waitForTimeout(1200);
    const png = await page.screenshot({ path: path.join(out, `${name}.png`) });
    const lit = await litShare(page, png);
    process.stdout.write(`${name}: ${(lit * 100).toFixed(0)}% lit\n`);
    if (lit < 0.05) blank++;
  }
  await browser.close();
  if (blank > 0) problems.push(`${blank} blank view(s)`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

await main();
