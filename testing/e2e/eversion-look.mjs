// ─────────────────────────────────────────────────────────────────────────────
// Globe eversion: the look at every tier, aspect ratio and theme, and its continuity (amendment 2026-10-18).
//
//   node testing/e2e/eversion-look.mjs
//   EVERSION_ARTIFACT_DIR=/some/dir node testing/e2e/eversion-look.mjs    # where the frames land
//
// No dev server, no build: it bundles lib/eversion/gl/__fixtures__/look-page.ts with esbuild and serves it from a
// fake origin (like eversion-gl.mjs). WebGL2 is SwiftShader, so it runs on a GPU-less box.
//
// For each scenario (tier × viewport × theme) it runs a whole navigation through the REAL timeline, LUT,
// orientation, renderer and shaders, and:
//
//  1. writes the frames at the stage boundaries as PNGs (`<dir>/eversion-look/<scenario>-<t>.png`), the pictures a
//     person judges the look by;
//  2. checks every frame drew with no GL error and that the cosmos is on exactly where `cosmosEnabled` says;
//  3. checks CONTINUITY: the mean frame-to-frame change (16 ms steps, a 160 px copy) never spikes. A pop - a body,
//     the starfield or a light arriving in one frame - shows as one step many times the size of its neighbours,
//     so each step is compared with the median of the eight around it.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(
  process.env.EVERSION_ARTIFACT_DIR ?? join(tmpdir(), 'eversion-artifacts'),
  'eversion-look',
);
mkdirSync(out, { recursive: true });

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync(chromium.executablePath())) return undefined;
  const base = '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n))) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = join(base, d, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

const SCENARIOS = [
  { name: 'desktop-high-dark', w: 1440, h: 900, tier: 'high', theme: 'dark', cosmos: true },
  { name: 'desktop-high-light', w: 1440, h: 900, tier: 'high', theme: 'light', cosmos: true },
  { name: 'desktop-mid-dark', w: 1440, h: 900, tier: 'mid', theme: 'dark', cosmos: true },
  { name: 'ultrawide-high-dark', w: 2560, h: 1080, tier: 'high', theme: 'dark', cosmos: true },
  { name: 'square-high-dark', w: 1100, h: 1000, tier: 'high', theme: 'dark', cosmos: true },
  { name: 'tablet-portrait-high-dark', w: 834, h: 1194, tier: 'high', theme: 'dark', cosmos: true },
  { name: 'phone-mid-dark', w: 390, h: 844, tier: 'mid', theme: 'dark', cosmos: false },
  { name: 'phone-low-light', w: 390, h: 844, tier: 'low', theme: 'light', cosmos: false },
  { name: 'desktop-low-dark', w: 1440, h: 900, tier: 'low', theme: 'dark', cosmos: false },
];
const only = process.env.EVERSION_LOOK_ONLY;
/** `EVERSION_LOOK_FRAMES_ONLY=1`: write the frames and skip the (slow, ~300-frame) continuity replay. */
const framesOnly = process.env.EVERSION_LOOK_FRAMES_ONLY === '1';
const TIMES = [0, 350, 650, 900, 1500, 2300, 3100, 3700, 4050, 4300, 4500];

const bundle = await build({
  entryPoints: [join(root, 'lib/eversion/gl/__fixtures__/look-page.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  logLevel: 'error',
});
const script = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><title>eversion look</title><body style="margin:0;background:#000"><script>${script.replaceAll('</script', '<\\/script')}</script>`;

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

try {
  for (const sc of SCENARIOS) {
    if (only && !sc.name.includes(only)) continue;
    const page = await browser.newPage({ viewport: { width: sc.w, height: sc.h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
    });
    await page.route('http://eversion.test/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: html }),
    );
    await page.goto('http://eversion.test/');
    const info = await page.evaluate((o) => window.__l.init(o), sc);
    check(
      `${sc.name}: cosmos ${sc.cosmos ? 'on' : 'off'}`,
      info.cosmos === sc.cosmos,
      `canvas ${info.canvas.join('x')}`,
    );

    const frames = await page.evaluate((t) => window.__l.frames(t), TIMES);
    for (const f of frames) {
      writeFileSync(
        join(out, `${sc.name}-${String(f.t).padStart(4, '0')}.png`),
        Buffer.from(f.png.split(',')[1], 'base64'),
      );
    }
    check(
      `${sc.name}: ${frames.length} frames without a GL error`,
      frames.length === TIMES.length && frames.every((f) => f.err === 0),
      frames
        .filter((f) => f.err)
        .map((f) => `${f.t}:${f.err}`)
        .join(' '),
    );

    if (framesOnly) {
      check(`${sc.name}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      await page.close();
      continue;
    }
    const deltas = await page.evaluate(() => window.__l.continuity(16));
    // A pop is a step far larger than the steps around it (motion itself is smooth at 16 ms).
    let worst = { ratio: 0, t: 0, d: 0, stage: '' };
    for (let i = 4; i < deltas.length - 4; i++) {
      const around = [...deltas.slice(i - 4, i), ...deltas.slice(i + 1, i + 5)]
        .map((x) => x.d)
        .sort((a, b) => a - b);
      const median = around[4];
      const ratio = deltas[i].d / Math.max(median, 0.35);
      if (ratio > worst.ratio)
        worst = { ratio, t: deltas[i].t, d: deltas[i].d, stage: deltas[i].stage };
    }
    const peak = Math.max(...deltas.map((x) => x.d));
    check(
      `${sc.name}: continuous (no frame changes > 4x its neighbours)`,
      worst.ratio <= 4,
      `worst ${worst.ratio.toFixed(2)}x at ${worst.t.toFixed(0)} ms (${worst.stage}, Δ ${worst.d.toFixed(2)}); peak Δ ${peak.toFixed(2)} over ${deltas.length} steps`,
    );
    check(`${sc.name}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`      frames in ${out}`);
if (failures) {
  console.error(`\n${failures} eversion look check(s) failed`);
  process.exit(1);
}
console.log('\nall eversion look checks passed');
