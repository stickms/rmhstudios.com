/**
 * Browser check for chapter flow (plan H3.2). Two modes:
 *
 *   harness  `/?level=dev_flow_a&hud=1` of the bare harness (models-harness/serve.ts): fires the chapter
 *            end from the console, screenshots the fade to black and the title card of chapter 2, and
 *            checks the save (level, flag, furthest chapter).
 *   site     `/harmonic` of the real page (needs Postgres, see the run scripts): the title screen's
 *            Chapters list from a seeded save, then dev_flow_a -> dev_flow_b -> "End of the current
 *            build" with its Back to title button.
 *
 *   [CHROMIUM_PATH=/path/to/chrome] pnpm exec tsx scripts/harmonic/flow-smoke.ts <harness|site> <out-dir> <base-url>
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const [mode, out, base] = process.argv.slice(2);
if (!mode || !out || !base) {
  console.error('usage: flow-smoke.ts <harness|site> <out-dir> <base-url>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const problems: string[] = [];
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(out, `${name}.png`) });

const send = (page: Page, command: string, ...args: (number | string)[]) =>
  page.evaluate(
    ([c, a]) => {
      const g = (window as unknown as { __rmhGame?: { store: { send(c: unknown): void } } })
        .__rmhGame;
      g?.store.send({ kind: 'extra', command: c, args: a });
    },
    [command, args] as [string, (number | string)[]],
  );

const saveOf = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('harmonic:save');
    return raw ? (JSON.parse(raw) as { level: string; flags: Record<string, unknown> }) : null;
  });

async function chapterTwo(page: Page, prefix: string) {
  await send(page, 'sv_cheats', 1);
  await send(page, 'ent_fire', 'dev_flag', 'Set', 'devSwitch 1');
  await send(page, 'ent_fire', 'dev_chapter_end', 'End');
  await page.waitForSelector('.harmonic-curtain[data-state="down"]', { timeout: 10_000 });
  await page.waitForTimeout(1000);
  await shot(page, `${prefix}-1-curtain`);
  await page.waitForSelector('.harmonic-curtain[data-state="card"]', { timeout: 60_000 });
  await page.waitForTimeout(300);
  await shot(page, `${prefix}-2-chapter-card`);
  const text = await page.locator('.harmonic-chapter-card').innerText();
  // The bare harness has no i18next instance, so "{{number}}" stays literal there; the site resolves it.
  const numberOk = mode === 'harness' ? /chapter/i.test(text) : /chapter 2/i.test(text);
  if (!numberOk || !/dev flow b/i.test(text)) problems.push(`card text: ${JSON.stringify(text)}`);
  const s = await saveOf(page);
  if (s?.level !== 'dev_flow_b' || s.flags.devSwitch !== true || s.flags.chapterReached !== 2)
    problems.push(`save after chapter end: ${JSON.stringify(s)}`);
  await page.waitForSelector('.harmonic-curtain[data-state="up"]', { timeout: 15_000 });
  await shot(page, `${prefix}-3-chapter-2-playing`);
}

async function main() {
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
  await page.addInitScript('window.__name = (f) => f;');
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      problems.push(`console: ${m.text()}`);
  });

  if (mode === 'harness') {
    await page.goto(`${base}/?level=dev_flow_a&hud=1`, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForSelector('.harmonic-hud', { timeout: 120_000 });
    await page.evaluate(() =>
      localStorage.setItem(
        'harmonic:save',
        JSON.stringify({ v: 1, level: 'dev_flow_a', flags: {}, savedAt: 1 }),
      ),
    );
    await page.waitForTimeout(1500);
    await chapterTwo(page, 'h');
    // Chapter 2 has no next chapter: the end command stops the run.
    await send(page, 'ent_fire', 'dev_chapter_end', 'End');
    await page.waitForFunction(() => document.title === 'harmonic:ended', null, {
      timeout: 15_000,
    });
  } else {
    await page.goto(`${base}/harmonic`, { waitUntil: 'load', timeout: 180_000 });
    await page.evaluate(() =>
      localStorage.setItem(
        'harmonic:save',
        JSON.stringify({ v: 1, level: 'dev_box', flags: { chapterReached: 3 }, savedAt: 1 }),
      ),
    );
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('heading', { name: 'Chapters' }).waitFor({ timeout: 60_000 });
    await shot(page, 's-0-title-chapters');
    const items = await page.locator('.harmonic-chapters li').count();
    if (items !== 3) problems.push(`chapters listed: ${items}`);
    // New game with ?level=: replaces the save (confirm first).
    await page.goto(`${base}/harmonic?level=dev_flow_a`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Continue' }).waitFor({ timeout: 60_000 }); // save read
    await page.getByRole('button', { name: 'New game' }).click();
    await page.getByRole('button', { name: 'Replace save' }).click();
    await page.waitForSelector('canvas', { timeout: 120_000 });
    await page.waitForSelector('.harmonic-hud', { timeout: 120_000 });
    await page.waitForTimeout(1500);
    await chapterTwo(page, 's');
    await send(page, 'ent_fire', 'dev_chapter_end', 'End');
    await page
      .getByRole('heading', { name: 'End of the current build' })
      .waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await shot(page, 's-4-end-of-build');
    await page.getByRole('button', { name: 'Back to title' }).click();
    await page.getByRole('button', { name: 'Continue' }).waitFor();
    await shot(page, 's-5-back-on-title');
  }
  await browser.close();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  process.stdout.write('flow smoke ok\n');
}

await main();
