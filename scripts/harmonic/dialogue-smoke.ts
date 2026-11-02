/**
 * Browser check for dialogue and subtitles (plan H3.1): opens `/?level=dev_dialogue&hud=1` of the
 * bare harness (`models-harness/serve.ts`, which mounts the React HUD with `hud=1`), starts the radio
 * script through the console, screenshots a radio line and a voice line (also over a blown-out
 * bright backdrop) and checks the text's WCAG contrast against the scrim over white and over black.
 *
 *   pnpm exec tsx scripts/harmonic/models-harness/serve.ts 7405 &
 *   [CHROMIUM_PATH=/path/to/chrome] pnpm exec tsx scripts/harmonic/dialogue-smoke.ts <out-dir> [base-url]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:7405';
if (!out) {
  console.error('usage: dialogue-smoke.ts <out-dir> [base-url]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

/** The minimum text contrast the plan asks for. */
const MIN_CONTRAST = 4.5;

const send = (page: Page, command: string, ...args: (number | string)[]) =>
  page.evaluate(
    ([c, a]) => {
      const g = (window as unknown as { __rmhGame?: { store: { send(c: unknown): void } } })
        .__rmhGame;
      g?.store.send({ kind: 'extra', command: c, args: a });
    },
    [command, args] as [string, (number | string)[]],
  );

const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Text colours and the scrim of the visible subtitle, as rgb(a) arrays. */
async function subtitleColours(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const name = el.querySelector('b') as HTMLElement;
    return {
      body: parse(getComputedStyle(el).color),
      name: parse(getComputedStyle(name).color),
      scrim: parse(getComputedStyle(el).backgroundColor),
    };
  }, selector);
}

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
  // tsx wraps named arrows in __name(); the page has no such helper.
  await page.addInitScript('window.__name = (f) => f;');
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      problems.push(`console: ${m.text()}`);
  });

  await page.goto(`${base}/?level=dev_dialogue&hud=1`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForSelector('canvas', { timeout: 90_000 });
  await page.waitForSelector('.harmonic-hud', { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await send(page, 'sv_cheats', 1);
  await send(page, 'ent_fire', 'dev_radio_check', 'Start');

  const radioSel = '.harmonic-hud-subtitle[data-channel="radio"]';
  const voiceSel = '.harmonic-hud-subtitle[data-speaker="ines"]';
  const check = async (name: string, sel: string) => {
    await page.waitForSelector(sel, { timeout: 15_000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    const c = await subtitleColours(page, sel);
    if (!c) return problems.push(`${name}: no subtitle`);
    // Worst cases: the scrim over pure white and over pure black.
    const a = c.scrim[3] ?? 1;
    for (const [label, ground] of [
      ['white', 255],
      ['black', 0],
    ] as const) {
      const bg = [0, 1, 2].map((i) => c.scrim[i] * a + ground * (1 - a));
      for (const [what, fg] of [
        ['text', c.body],
        ['name', c.name],
      ] as const) {
        const r = contrast(fg.slice(0, 3), bg);
        process.stdout.write(`${name} ${what} on ${label}: ${r.toFixed(2)}\n`);
        if (r < MIN_CONTRAST) problems.push(`${name}: ${what} ${r.toFixed(2)} on ${label}`);
      }
    }
  };

  await check('01-radio-line', radioSel);
  await check('02-voice-line', voiceSel);
  // The same lines over a bright backdrop.
  await page.evaluate(() => {
    (document.getElementById('game') as HTMLElement).style.filter = 'brightness(12)';
  });
  await send(page, 'ent_fire', 'dev_radio_check', 'Cancel');
  await send(page, 'ent_fire', 'dev_radio_check', 'Start');
  await check('03-radio-line-bright', radioSel);
  await send(page, 'ent_fire', 'dev_hint', 'ShowHint');
  await page.waitForSelector('.harmonic-hud-hint', { timeout: 5000 });
  await page.screenshot({ path: path.join(out, '04-hint.png') });
  await browser.close();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

await main();
