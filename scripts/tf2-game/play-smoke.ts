/**
 * Real-browser smoke test of the playable games (not part of any test suite):
 * TF2 offline against bots at /tf2/play, Half-Life 2 at /half-life-2, Portal at
 * /portal, and a phone in landscape and portrait. Drives headless Chromium
 * (SwiftShader WebGL — slow, but it renders), writes screenshots and a JSON of
 * what each step saw (client.debug(): phase, origin, frame rate, draw calls…).
 *
 * Needs a dev server with the map packages in local storage:
 *
 *   # map packages as scripts/tf2-game/build-maps.ts writes them, one directory per game
 *   mkdir -p .uploads && ln -s <maps-out>/tf2 .uploads/tf2-game   # and hl2-game, portal-game
 *   DATABASE_URL=postgresql://x:x@127.0.0.1:1/x BETTER_AUTH_SECRET=<32+ chars> \
 *     BETTER_AUTH_URL=http://localhost:7997 LOCAL_STORAGE_DIR=.uploads \
 *     pnpm exec vite dev --port 7997
 *   pnpm exec tsx scripts/tf2-game/play-smoke.ts --base http://localhost:7997 --out /tmp/play-smoke \
 *     [--only tf2,hl2,portal,phone] [--classes scout,soldier,…] [--chromium <chrome binary>]
 *
 * (No Postgres is needed: the pages render signed out. Online play needs the
 * socket hub — `pnpm run socket-server` — and is not driven here.) The dev build
 * exposes the running client as `window.__rmhGame`; the script reads its
 * `debug()` and writes the input state it shares with the devices.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k: string, d?: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:7997')!;
const OUT = arg('out', path.resolve('play-smoke-out'))!;
const ONLY = new Set((arg('only', 'tf2,hl2,portal,phone') ?? '').split(','));
const MAP = arg('map', 'ctf_2fort')!;
const CLASSES = (arg('classes', 'scout,soldier,pyro,demoman,heavy,engineer,medic,sniper,spy') ?? '').split(',').filter(Boolean);
const LOAD_TIMEOUT = Number(arg('timeout', '300000'));

mkdirSync(OUT, { recursive: true });
const report: Record<string, unknown> = {};
const log = (...a: unknown[]) => process.stdout.write(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');

type Debug = Record<string, unknown> & { stats?: Record<string, unknown> };

async function debug(page: Page): Promise<Debug | null> {
  return page.evaluate(() => {
    const g = (window as unknown as { __rmhGame?: { debug?: () => unknown } }).__rmhGame;
    return (g?.debug?.() as Record<string, unknown>) ?? null;
  });
}

async function waitRunning(page: Page, label: string): Promise<void> {
  const t0 = Date.now();
  await page.waitForFunction(
    () => {
      const p = document.querySelector('.tf2g-stage')?.getAttribute('data-phase');
      return p === 'running' || p === 'error' || p === 'ended';
    },
    undefined,
    { timeout: LOAD_TIMEOUT, polling: 500 },
  );
  const phase = await page.getAttribute('.tf2g-stage', 'data-phase');
  log(`${label}: ${phase} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (phase === 'error') {
    const text = await page.locator('.tf2g-play-screen').innerText();
    throw new Error(`${label} failed: ${text}`);
  }
}

/** Clicks until the game surface mounts (the first clicks can land before hydration in a dev build). */
async function startGame(page: Page, name: RegExp, setup?: () => Promise<void>): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await setup?.();
    await page.getByRole('button', { name }).first().click();
    try {
      await page.waitForSelector('.tf2g-stage', { timeout: 3000 });
      return;
    } catch {
      /* not hydrated yet */
    }
  }
  throw new Error('the game never mounted');
}

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, timeout: 120_000 });
  log(`  → ${file}`);
}

/** Holds input actions on the shared input state for `ms` (no pointer lock needed). */
async function hold(page: Page, actions: string[], ms: number): Promise<void> {
  await page.evaluate((a) => {
    const g = (window as unknown as { __rmhGame?: { input: { held: { key: Set<string> } } } }).__rmhGame;
    for (const x of a) g?.input.held.key.add(x);
  }, actions);
  await page.waitForTimeout(ms);
  await page.evaluate((a) => {
    const g = (window as unknown as { __rmhGame?: { input: { held: { key: Set<string> } } } }).__rmhGame;
    for (const x of a) g?.input.held.key.delete(x);
  }, actions);
}

async function look(page: Page, yawDeg: number, pitchDeg = 0): Promise<void> {
  await page.evaluate(
    ([y, p]) => {
      const g = (window as unknown as { __rmhGame?: { input: { lookYaw: number; lookPitch: number } } }).__rmhGame;
      if (g) {
        g.input.lookYaw += y;
        g.input.lookPitch += p;
      }
    },
    [yawDeg, pitchDeg],
  );
}

async function hudCommand(page: Page, cmd: Record<string, unknown>): Promise<void> {
  await page.evaluate((c) => {
    const g = (window as unknown as { __rmhGame?: { store: { send(c: unknown): void } } }).__rmhGame;
    g?.store.send(c);
  }, cmd);
}

async function tf2(page: Page): Promise<void> {
  await page.goto(`${BASE}/tf2/play`, { waitUntil: 'domcontentloaded' });
  await shot(page, 'tf2-lobby');
  if (MAP !== 'ctf_2fort') log('  (map selection: default list order; pass the map in the lobby by hand for others)');
  await startGame(page, /Play offline/i, () => page.getByRole('spinbutton').first().fill('3'));
  await page.waitForTimeout(1500);
  await shot(page, 'tf2-loading');
  await waitRunning(page, 'tf2');
  await page.waitForTimeout(3000);
  await shot(page, 'tf2-join-menu');
  await hudCommand(page, { kind: 'team', team: 'red' });
  const results: Record<string, unknown> = {};
  for (const cls of CLASSES) {
    await hudCommand(page, { kind: 'class', cls });
    await page.waitForTimeout(4000);
    const before = await debug(page);
    await hold(page, ['forward'], 1200);
    await look(page, 35);
    await hold(page, ['attack'], 900);
    await page.waitForTimeout(400);
    const after = await debug(page);
    await shot(page, `tf2-${cls}`);
    results[cls] = { before, after };
    log(`  ${cls}: alive=${String(after?.alive)} cls=${String(after?.cls)} moved=${JSON.stringify(before?.origin)} → ${JSON.stringify(after?.origin)} fps=${String(after?.stats?.fps)}`);
  }
  // Scoreboard held.
  await hold(page, ['showscores'], 50);
  report.tf2 = results;
}

async function sp(page: Page, game: 'hl2' | 'portal'): Promise<void> {
  await page.goto(`${BASE}/${game === 'hl2' ? 'half-life-2' : 'portal'}`, { waitUntil: 'domcontentloaded' });
  await shot(page, `${game}-menu`);
  await startGame(page, /New game/i);
  await page.waitForTimeout(1500);
  await shot(page, `${game}-loading`);
  await waitRunning(page, game);
  await page.waitForTimeout(4000);
  const start = await debug(page);
  await shot(page, `${game}-start`);
  await hold(page, ['forward'], 2500);
  await look(page, 60);
  await page.waitForTimeout(800);
  const walked = await debug(page);
  await shot(page, `${game}-walked`);
  if (game === 'portal') {
    await hold(page, ['attack'], 150);
    await page.waitForTimeout(800);
    await look(page, 150);
    await hold(page, ['attack2'], 150);
    await page.waitForTimeout(1500);
    await shot(page, `${game}-portals`);
  }
  const end = await debug(page);
  log(`  ${game}: ${JSON.stringify(start?.origin)} → ${JSON.stringify(walked?.origin)}; portals ${JSON.stringify(end?.portals ?? [])}; fps ${String(end?.stats?.fps)}`);
  report[game] = { start, walked, end };
}

async function phone(browser: import('playwright').Browser): Promise<void> {
  for (const [name, viewport] of [
    ['landscape', { width: 844, height: 390 }],
    ['portrait', { width: 390, height: 844 }],
  ] as const) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tf2/play`, { waitUntil: 'domcontentloaded' });
    await shot(page, `phone-${name}-lobby`);
    await startGame(page, /Play offline/i, () => page.getByRole('spinbutton').first().fill('2'));
    await waitRunning(page, `phone ${name}`);
    await page.waitForTimeout(2000);
    await hudCommand(page, { kind: 'team', team: 'blue' });
    await hudCommand(page, { kind: 'class', cls: 'soldier' });
    await page.waitForTimeout(5000);
    await shot(page, `phone-${name}-game`);
    report[`phone-${name}`] = await debug(page);
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    // A pre-installed Chromium whose version differs from the playwright package: --chromium <path>.
    executablePath: arg('chromium') ?? process.env.CHROMIUM_PATH,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors: string[] = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const steps: Array<[string, () => Promise<void>]> = [
    ['tf2', () => tf2(page)],
    ['hl2', () => sp(page, 'hl2')],
    ['portal', () => sp(page, 'portal')],
    ['phone', () => phone(browser)],
  ];
  for (const [name, run] of steps) {
    if (!ONLY.has(name)) continue;
    try {
      await run();
    } catch (e) {
      log(`${name}: FAILED ${e instanceof Error ? e.message : String(e)}`);
      report[`${name}-error`] = String(e);
      await shot(page, `${name}-failure`).catch(() => {});
    }
  }
  report.consoleErrors = errors.slice(0, 50);
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  log(`report → ${path.join(OUT, 'report.json')} (${errors.length} console errors)`);
  await browser.close();
}

void main();
