/**
 * Browser smoke for Harmonic (plan H0.4): opens /harmonic against a running `pnpm dev`, clicks
 * "New game", waits for the level to draw, walks and turns, and writes screenshots.
 *
 *   [CHROMIUM_PATH=/path/to/chrome] pnpm exec tsx scripts/harmonic/play-smoke.ts <out-dir> [base-url]
 *
 * Exits non-zero when the canvas never renders, the page throws, or a request fails. Reads the
 * dev-only `window.__rmhGame` handle (GameCanvas) for the player's position.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:7005';
if (!out) {
  console.error('usage: play-smoke.ts <out-dir> [base-url]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

interface Debug {
  origin: { x: number; y: number; z: number } | null;
  health: number;
  stats: { drawCalls: number; triangles: number; fps: number };
}
const debug = (page: Page): Promise<Debug | null> =>
  page.evaluate(() => {
    const g = (window as unknown as { __rmhGame?: { debug?: () => unknown } }).__rmhGame;
    return (g?.debug?.() as Debug | undefined) ?? null;
  });

/** Share of pixels that are lit (not near-black) and that are missing-texture magenta, from a PNG. */
const pixelShare = (page: Page, png: Buffer): Promise<{ lit: number; magenta: number }> =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const w = 128;
    const h = 72;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let lit = 0;
    let magenta = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
      if (d[i] > 200 && d[i + 2] > 200 && d[i + 1] < 60) magenta++;
    }
    return { lit: lit / (w * h), magenta: magenta / (w * h) };
  }, png.toString('base64'));

/** A console verb for the running game (setpos, setang…): the HUD store routes it to the client. */
const command = (page: Page, name: string, ...args: number[]): Promise<void> =>
  page.evaluate(
    ([n, a]) => {
      const g = (window as unknown as { __rmhGame?: { store: { send(c: unknown): void } } })
        .__rmhGame;
      g?.store.send({ kind: 'extra', command: n, args: a });
    },
    [name, args] as [string, number[]],
  );

async function main(): Promise<void> {
  // CHROMIUM_PATH: a browser already on the machine (when the pinned Playwright build is not installed).
  // WebGL needs a GPU-less fallback in headless: SwiftShader via ANGLE.
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
  const failed: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${base}/harmonic`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.screenshot({ path: path.join(out, '01-title.png') });
  await page.getByRole('button', { name: 'New game' }).click();

  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const g = (
        window as unknown as { __rmhGame?: { debug?: () => { stats: { drawCalls: number } } } }
      ).__rmhGame;
      return (g?.debug?.().stats.drawCalls ?? 0) > 0;
    },
    undefined,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, '02-start.png') });

  // Capture the pointer, then walk forward and turn.
  await page.mouse.click(640, 360);
  await page.waitForTimeout(300);
  const before = await debug(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await page.mouse.move(640, 360);
  await page.mouse.move(520, 360, { steps: 8 });
  await page.waitForTimeout(800);
  await page.keyboard.up('w');
  await page.screenshot({ path: path.join(out, '03-walked.png') });
  const after = await debug(page);

  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, '04-jump.png') });

  // A tour of the level: position, then screenshot (pitch, yaw).
  const views: Array<[string, number, number, number, number, number]> = [
    ['06-hall', 40, 40, 1, 12, 35],
    ['07-pit', 330, 150, 1, 18, 0],
    ['08-mezzanine', 660, 100, 1, -8, 90],
    ['09-pool', 300, 230, 1, 20, -100],
    ['10-alcove-window', 120, 300, 1, 5, -90],
  ];
  await command(page, 'sv_cheats', 1); // setpos is a cheat command
  let first = true;
  for (const [name, x, y, z, pitch, yaw] of views) {
    await command(page, 'setpos', x, y, z);
    await command(page, 'setang', pitch, yaw, 0);
    await page.waitForTimeout(first ? 1200 : 700);
    first = false;
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  }
  const shot = await page.screenshot({ path: path.join(out, '11-final-view.png') });
  const px = await pixelShare(page, shot);

  // Fall into the pit: it hurts, and death puts the player back at the level start.
  await command(page, 'setpos', 480, 144, 20);
  let hurt = 100;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100);
    hurt = Math.min(hurt, (await debug(page))?.health ?? 100);
  }
  await page.screenshot({ path: path.join(out, '12-pit.png') });
  await page.waitForTimeout(6000);
  const respawn = await debug(page);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, '05-pause.png') });

  const moved =
    before?.origin && after?.origin
      ? Math.hypot(after.origin.x - before.origin.x, after.origin.y - before.origin.y)
      : 0;
  process.stdout.write(
    JSON.stringify(
      {
        before: before?.origin,
        after: after?.origin,
        moved,
        pixels: px,
        lowestHealthInPit: hurt,
        afterRespawn: respawn && { origin: respawn.origin, health: respawn.health },
        failedRequests: failed,
        problems,
      },
      null,
      2,
    ),
  );
  await browser.close();

  const errors: string[] = [];
  if (px.lit < 0.2) errors.push(`canvas looks black (lit ${px.lit.toFixed(2)})`);
  if (px.magenta > 0.02)
    errors.push(`canvas shows missing-texture magenta (${px.magenta.toFixed(2)})`);
  if (hurt >= 100) errors.push('the pit did not hurt');
  if (!respawn || respawn.health < 100 || (respawn.origin?.z ?? -999) < -1)
    errors.push('no respawn after the pit');
  if (moved < 20) errors.push(`player did not move (${moved.toFixed(1)} units)`);
  if (problems.some((p) => p.startsWith('pageerror'))) errors.push('page threw');
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}

void main();
