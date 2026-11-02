/**
 * Browser check for the weapons (plan H1.3): opens `/?level=dev_weapons` of the bare harness
 * (`models-harness/serve.ts`), collects every pickup with `setpos`, then screenshots each view
 * model held and the coil mid-fire.
 *
 *   pnpm exec tsx scripts/harmonic/models-harness/serve.ts 7406 &
 *   [CHROMIUM_PATH=/path/to/chrome] pnpm exec tsx scripts/harmonic/weapons-smoke.ts <out-dir> [base-url]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:7406';
if (!out) {
  console.error('usage: weapons-smoke.ts <out-dir> [base-url]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

type Win = {
  __rmhGame?: { store: { send(c: unknown): void } };
  __rmhInput?: { weaponSelect: number; held: { key: Set<string> } };
};

const command = (page: Page, name: string, ...args: number[]): Promise<void> =>
  page.evaluate(
    ([n, a]) => {
      (window as unknown as Win).__rmhGame?.store.send({ kind: 'extra', command: n, args: a });
    },
    [name, args] as [string, number[]],
  );

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      problems.push(`console: ${m.text()}`);
  });
  await page.goto(`${base}/?level=dev_weapons`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForSelector('canvas', { timeout: 90_000 });
  await page.waitForFunction(
    () => {
      const g = (window as unknown as { __rmhGame?: { debug?: () => { stats: { drawCalls: number } } } })
        .__rmhGame;
      return (g?.debug?.().stats.drawCalls ?? 0) > 0;
    },
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1500);
  await command(page, 'sv_cheats', 1);
  // Pickups: prybar, pulse, coil, pulse ammo, coil ammo.
  for (const [x, y] of [
    [140, 192],
    [220, 192],
    [300, 192],
    [220, 100],
    [300, 100],
  ]) {
    await command(page, 'setpos', x, y, 20);
    await page.waitForTimeout(500);
  }
  await command(page, 'setpos', 120, 192, 1);
  await command(page, 'setang', 0, 0, 0);
  const select = async (n: number) => {
    await page.evaluate((s) => {
      (window as unknown as Win).__rmhInput!.weaponSelect = s;
    }, n);
    await page.waitForTimeout(1500);
  };
  const attack = (down: boolean) =>
    page.evaluate((d) => {
      const h = (window as unknown as Win).__rmhInput!.held.key;
      if (d) h.add('attack');
      else h.delete('attack');
    }, down);
  await select(1);
  await page.screenshot({ path: path.join(out, '01-prybar.png') });
  await select(2);
  await page.screenshot({ path: path.join(out, '02-pulse.png') });
  await select(3);
  await page.screenshot({ path: path.join(out, '03-coil.png') });
  await attack(true);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(out, '04-coil-firing.png') });
  await attack(false);
  await browser.close();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

await main();
