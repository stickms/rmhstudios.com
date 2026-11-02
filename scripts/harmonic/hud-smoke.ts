/**
 * Browser smoke for Harmonic's HUD, pause menu, options and saves (plan H1.4). Run against a
 * running `pnpm dev` (see play-smoke.ts for the environment):
 *
 *   [CHROMIUM_PATH=/path/to/chrome] pnpm exec tsx scripts/harmonic/hud-smoke.ts <out-dir> [base-url]
 *
 * Starts a new game, checks the HUD shows health and drops in the pit, opens the pause menu and
 * Options (changing the field of view), resumes, and reloads to check Continue round-trips. The
 * pause menu is also shot in the light app appearance. Exits non-zero on any failed check.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:7005';
if (!out) {
  console.error('usage: hud-smoke.ts <out-dir> [base-url]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(out, `${name}.png`) });
const command = (page: Page, name: string, ...args: number[]): Promise<void> =>
  page.evaluate(
    ([n, a]) => {
      const g = (window as unknown as { __rmhGame?: { store: { send(c: unknown): void } } })
        .__rmhGame;
      g?.store.send({ kind: 'extra', command: n, args: a });
    },
    [name, args] as [string, number[]],
  );
const healthText = (page: Page) =>
  page.locator('.harmonic-hud-vitals .harmonic-hud-value').first().textContent();

async function startLevel(page: Page, label: string): Promise<void> {
  const shot = (p: Page, n: string) => p.screenshot({ path: path.join(out, `${n}.png`) });
  // The dev server hydrates late: click again until the game's canvas mounts.
  for (let i = 0; i < 20 && (await page.locator('canvas').count()) === 0; i++) {
    await page.getByRole('button', { name: label }).click();
    await page.waitForTimeout(1500);
  }
  await page
    .waitForFunction(
      () => {
        const g = (
          window as unknown as { __rmhGame?: { debug?: () => { stats: { drawCalls: number } } } }
        ).__rmhGame;
        return (g?.debug?.().stats.drawCalls ?? 0) > 0;
      },
      undefined,
      { timeout: 90_000 },
    )
    .catch(async (e) => {
      await shot(page, 'FAIL-start');
      throw e;
    });
  await page.waitForTimeout(1200);
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
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`console: ${m.text().slice(0, 300)}`);
  });
  const check = (ok: boolean, msg: string) => {
    if (!ok) errors.push(msg);
  };

  await page.goto(`${base}/harmonic`, { waitUntil: 'load', timeout: 120_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  check(
    (await page.getByRole('button', { name: 'Continue' }).count()) === 0,
    'Continue shown without a save',
  );
  await shot(page, '01-title-fresh');

  await startLevel(page, 'New game');
  await page.mouse.click(640, 360);
  await page.waitForTimeout(300);
  await page.waitForSelector('.harmonic-hud-vitals');
  check((await healthText(page))?.trim() === '100', 'HUD does not start at 100 health');
  await shot(page, '02-hud-full');

  // The pit hurts: the HUD follows.
  await command(page, 'sv_cheats', 1);
  await command(page, 'setpos', 480, 144, 20);
  let lowest = 100;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    lowest = Math.min(lowest, Number((await healthText(page))?.trim() ?? 100));
  }
  check(lowest < 100, 'HUD health did not drop in the pit');
  await shot(page, '03-hud-hurt');
  await page.waitForTimeout(6000);

  // Pause → options → FOV → back → resume.
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(500);
  await shot(page, '04-pause');
  check(
    (await page.getByRole('button', { name: 'Quit to title' }).count()) === 1,
    'pause menu lacks Quit to title',
  );
  await page.getByRole('button', { name: 'Options' }).click();
  await shot(page, '05-options');
  const fov = page.getByLabel('Field of view');
  await fov.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  const fovValue = Number(await fov.inputValue());
  check(fovValue >= 80, `FOV did not change (${fovValue})`);
  await page.getByLabel('Invert Y axis').check();
  await page.getByLabel('Subtitle size').selectOption('large');
  await shot(page, '06-options-changed');
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).filter(
      ([k]) => k.includes('settings') || k.startsWith('harmonic'),
    ),
  );
  check(
    stored.some(([k, v]) => k.includes('settings') && JSON.parse(v).fov === fovValue),
    'FOV not persisted in the settings',
  );
  check(
    stored.some(([k, v]) => k === 'harmonic:prefs' && v.includes('large')),
    'subtitle size not persisted',
  );

  // The light appearance of the same menu (AppShell's `app-light` modifier on the app root).
  await page.evaluate(() => document.querySelector('.harmonic-root')?.classList.add('app-light'));
  await page.waitForTimeout(300);
  await shot(page, '07-options-light');
  await page.evaluate(() =>
    document.querySelector('.harmonic-root')?.classList.remove('app-light'),
  );

  // Esc steps back from Options, then closes the menu (the impulse owns Esc).
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resume' }).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await page.getByRole('dialog').count()) === 0, 'Esc did not close the menu');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(400);
  check((await page.getByRole('dialog').count()) === 0, 'menu still open after Resume');
  await shot(page, '08-resumed');

  // Continue round-trips: leave to the title, then continue.
  const save = await page.evaluate(() => localStorage.getItem('harmonic:save'));
  check(!!save && JSON.parse(save).level === 'dev_box', `no level-start save (${save})`);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to title' }).click();
  await page.getByRole('button', { name: 'Continue' }).waitFor();
  await shot(page, '09-title-continue');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('alertdialog').waitFor();
  await shot(page, '10-confirm');
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.reload({ waitUntil: 'load' });
  await startLevel(page, 'Continue');
  await page.waitForSelector('.harmonic-hud-vitals');
  await shot(page, '11-continued');

  await browser.close();
  process.stdout.write(JSON.stringify({ lowest, fovValue, errors }, null, 2));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}

void main();
