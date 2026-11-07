/**
 * Real-browser check of Hearthworks' remote character models. Opt-in; not part of `pnpm test`:
 *
 *   NODE_USE_ENV_PROXY=1 pnpm exec tsx testing/hearthworks-models/run.ts [--out <dir>] [--skins gman,scout] [--views front,three,side] [--wait ms]
 *
 * For each skin: open the harness page (the production `SkinFigure`), wait for its model to arrive from the live asset
 * channel (R2, via the harness server's pass-through), then screenshot it idle from several sides and in each state
 * the game drives (walk, run, jump, fall, shoot, reload, hurt, interact, death). What to look at in the PNGs:
 * upright, feet on the ground, facing the red axis (+Z), textured, the right team colour, the prop in the right hand,
 * the root staying put while walking. `HW_TF2_SKIN=1` shows the TF2 classes in BLU. It prints a per-skin line: load time, triangles, kept clips, bytes fetched.
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { startModelHarness } from './harness';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/** How long to wait for a model before reporting `timeout` (the figure then stays procedural). */
const WAIT_MS = Number(arg('wait', '90000'));
const OUT = arg('out', path.join(process.cwd(), '.hearthworks-models-shots'));
const SKINS = arg('skins', 'citizen,worker,rebel,barney,metrocop,gman,scout,soldier,pyro,demoman,heavy,engineer,medic,sniper,spy').split(',');
const VIEWS = arg('views', 'front,three,side').split(',');
/** The repo's Playwright can want a newer Chromium than the box has: `CHROMIUM_PATH`, `/opt/pw-browsers/chromium` or a system Chrome. */
function executablePath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    /* fall through */
  }
  for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome']) if (existsSync(p)) return p;
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Status {
  status: string;
  triangles: number | null;
  height: number | null;
  clips: string[];
}

async function status(page: Page): Promise<Status> {
  return page.evaluate(() => window.hw?.status() as Status);
}

async function waitReady(page: Page, ms: number): Promise<Status> {
  const t0 = Date.now();
  for (;;) {
    const s = await status(page).catch(() => null);
    if (s?.status === 'ready') return s;
    if (Date.now() - t0 > ms) return s ?? { status: 'timeout', triangles: null, height: null, clips: [] };
    await sleep(250);
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const harness = await startModelHarness();
  const browser = await chromium.launch({
    executablePath: executablePath(),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const errors: string[] = [];
  let failed = 0;
  try {
    for (const skin of SKINS) {
      const shots: string[] = [];
      const before = harness.fetched.length;
      for (const view of VIEWS) {
        const page = await browser.newPage({ viewport: { width: 420, height: 420 } });
        page.on('pageerror', (e) => errors.push(`${skin}/${view}: ${e.message}`));
        page.on('console', (m) => {
          const t = m.text();
          if (m.type() === 'error' && !/GL Driver|swiftshader|GPU stall/i.test(t)) errors.push(`${skin}/${view}: ${t.slice(0, 200)}`);
          if (m.type() === 'warning' && /three|Property|binding/i.test(t) && !/THREE\.Clock/.test(t)) errors.push(`${skin}/${view} warn: ${t.slice(0, 200)}`);
        });
        const t0 = Date.now();
        await page.goto(`${harness.url}/?skin=${skin}&view=${view}`, { waitUntil: 'load' });
        const s = await waitReady(page, WAIT_MS);
        const loadMs = Date.now() - t0;
        if (view === VIEWS[0]) {
          const files = harness.fetched.slice(before);
          const wire = files.reduce((n, f) => n + (f.wireBytes ?? 0), 0);
          const raw = files.reduce((n, f) => n + f.decodedBytes, 0);
          console.log(
            `${skin.padEnd(10)} ${s.status.padEnd(8)} ${String(loadMs).padStart(6)} ms  tris ${String(s.triangles).padStart(6)}  h ${s.height?.toFixed(2)} m  clips ${s.clips.join(',')}  fetched ${files.length} files wire ${(wire / 1024).toFixed(0)} KB / decoded ${(raw / 1024).toFixed(0)} KB`,
          );
          if (s.status !== 'ready') failed++;
        }
        const snap = async (label: string) => {
          const file = path.join(OUT, `${skin}-${view}-${label}.png`);
          await page.screenshot({ path: file });
          shots.push(file);
        };
        await sleep(600);
        await snap('idle');
        if (view === 'three' || view === VIEWS[0]) {
          await page.evaluate(() => window.hw.set({ speed: 1.6 }));
          await sleep(1400);
          await snap('walk');
          await sleep(350);
          await snap('walk2');
          await page.evaluate(() => window.hw.set({ speed: 3.0 }));
          await sleep(1400);
          await snap('run');
          await sleep(250);
          await snap('run2');
          await page.evaluate(() => window.hw.set({ speed: 0, air: 'jump' }));
          await sleep(300);
          await snap('jump');
          await page.evaluate(() => window.hw.set({ air: 'fall' }));
          await sleep(700);
          await snap('fall');
          await page.evaluate(() => window.hw.set({ air: 'ground' }));
          await sleep(900);
          for (const slot of ['shoot', 'reload', 'hurt'] as const) {
            await page.evaluate((s2) => window.hw.trigger(s2), slot);
            await sleep(slot === 'shoot' ? 120 : 300);
            await snap(slot);
            await sleep(1400);
          }
          await page.evaluate(() => window.hw.set({ busy: true }));
          await sleep(700);
          await snap('interact');
          await page.evaluate(() => window.hw.set({ busy: false }));
          await sleep(2600);
          await page.evaluate(() => window.hw.set({ dead: true }));
          await sleep(500);
          await snap('death-mid');
          await sleep(2200);
          await snap('death');
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await harness.close();
  }
  if (errors.length) console.log(`page errors/warnings (${errors.length}):\n  ${[...new Set(errors)].slice(0, 20).join('\n  ')}`);
  console.log(`screenshots in ${OUT}`);
  process.exit(failed || errors.length ? 1 : 0);
}

void main();
