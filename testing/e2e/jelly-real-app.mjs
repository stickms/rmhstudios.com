/* global WebGL2RenderingContext -- referenced only inside page callbacks (addInitScript). */
/** Plasmatic Jelly on the REAL app — the path the fixture harnesses (jelly-interaction.mjs, liquid-glass-engine.mjs)
 * never take: the site's own bundle, `components/Providers.tsx` → `hooks/useLiquidInteractions.ts` → the lazy
 * `lib/liquid/glass/engine` chunk at idle, the service worker blocked so every chunk is the server's.
 *
 *   pnpm build && PORT=7106 node .output/server/index.mjs        # or `pnpm exec vite dev --port 7106`
 *   APP_URL=http://localhost:7106 CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *     node testing/e2e/jelly-real-app.mjs
 *
 * Anonymous pages render without a database (`/jelly` needs none), so no DB is required.
 *
 * It asserts, per route (default `/jelly`; `JELLY_ROUTES=/jelly,/games`):
 * - **Shaders:** every WebGL2 program the page compiles links — compile and link logs are captured by wrapping
 *   `compileShader`/`linkProgram` before any app code runs — and no chunk request fails.
 * - **Mount:** the engine installs from the real hook: rim slabs (`[data-liquid-canvas="on"]`) and haze canvases
 *   (`.jelly-haze-canvas`, host `data-jelly-haze="on"`) appear, and the CSS carriers (`.jelly-flow` spans) run their
 *   `jelly-drift` / `jelly-current` animations.
 * - **Visible currents:** the largest pane's haze canvas uses its range — interior alpha sd ≥ `MIN_INTERIOR_SD` /255.
 *   Before the G1 retune (lib/liquid/glass/haze-shader.ts `HAZE_LOOK`) it was 0.5–1.2: a flat veil, "the eddies and
 *   internal currents are not present".
 * - **Never frozen (GPU only):** after `IDLE_AFTER_MS` with no input the haze still redraws. The governor used to judge
 *   idle-floor ticks (83 ms) against the 30 Hz period and froze every desktop within ~12 s of reading
 *   (lib/jelly/governor.ts; unit-pinned in lib/jelly/__tests__/governor.test.ts). On software GL the governor sheds
 *   for real, so this check is a reported SKIP there (testing/e2e/lib/gpu.mjs), never a silent pass.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { annotateSkip, describeRenderer, probeRenderer } from './lib/gpu.mjs';

const BASE = (process.env.APP_URL || 'http://localhost:7106').replace(/\/$/, '');
const ROUTES = (process.env.JELLY_ROUTES || '/jelly').split(',');
const MIN_INTERIOR_SD = 2;
const IDLE_AFTER_MS = 20_000;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
await context.addInitScript(() => {
  const gl = (window.__jellyGl = { compileErrors: [], linkErrors: [], programs: 0 });
  const proto = WebGL2RenderingContext.prototype;
  const compile = proto.compileShader;
  proto.compileShader = function (s) {
    compile.call(this, s);
    if (!this.getShaderParameter(s, this.COMPILE_STATUS))
      gl.compileErrors.push(this.getShaderInfoLog(s));
  };
  const link = proto.linkProgram;
  proto.linkProgram = function (p) {
    link.call(this, p);
    gl.programs++;
    if (!this.getProgramParameter(p, this.LINK_STATUS))
      gl.linkErrors.push(this.getProgramInfoLog(p));
  };
});

const page = await context.newPage();
const gpu = await probeRenderer(page);
console.log(describeRenderer(gpu));
const failures = [];
const skips = [];
const failedChunks = [];
page.on('requestfailed', (r) => {
  if (/\.(js|mjs|ts|tsx)(\?|$)/.test(r.url()))
    failedChunks.push(`${r.url()} ${r.failure()?.errorText}`);
});
page.on('pageerror', (e) => console.log(`  pageerror: ${e.message.slice(0, 200)}`));

const check = (name, fn) => {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}\n  ${String(error.message).split('\n').join('\n  ')}`);
  }
};

/** The largest haze canvas: interior alpha sd (15% inset) and a fingerprint of its pixels. */
const hazeSample = () =>
  page.evaluate(() => {
    const all = [...document.querySelectorAll('.jelly-haze-canvas')];
    const c = all.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!c) return null;
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const m = Math.round(c.width * 0.15);
    const inner = [];
    let hash = 0;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const a = data[(y * c.width + x) * 4 + 3];
        hash = (hash * 31 + a) | 0;
        if (a && x > m && x < c.width - m && y > m && y < c.height - m) inner.push(a);
      }
    const mean = inner.reduce((s, v) => s + v, 0) / Math.max(1, inner.length);
    const sd = Math.sqrt(
      inner.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, inner.length),
    );
    return { sd, hash, size: `${c.width}x${c.height}` };
  });

for (const route of ROUTES) {
  console.log(`\n${route}`);
  failedChunks.length = 0;
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 120_000 });
  // The engine mounts at idle (requestIdleCallback, 2.5 s timeout); software GL can stall the first context for long.
  const mounted = await page
    .waitForFunction(
      () =>
        document.querySelector('[data-liquid-canvas="on"]') &&
        document.querySelector('[data-jelly-haze="on"] > .jelly-haze-canvas'),
      null,
      { timeout: 90_000 },
    )
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({
    gl: window.__jellyGl,
    rims: document.querySelectorAll('[data-liquid-canvas="on"] > .liquid-glass-canvas').length,
    haze: document.querySelectorAll('[data-jelly-haze="on"] > .jelly-haze-canvas').length,
    carrierAnims: [...document.querySelectorAll('.jelly-flow > span')]
      .flatMap((s) => s.getAnimations().map((a) => `${a.animationName}:${a.playState}`))
      .slice(0, 4),
  }));
  console.log(`  ${JSON.stringify({ ...state, gl: { ...state.gl } })}`);

  check(`${route}: every jelly shader compiles and links`, () => {
    assert.deepEqual(state.gl.compileErrors, [], 'shader compile errors');
    assert.deepEqual(state.gl.linkErrors, [], 'program link errors');
    assert.ok(state.gl.programs > 0, 'no WebGL2 program was linked at all');
  });
  check(`${route}: no chunk request failed`, () => assert.deepEqual(failedChunks, []));
  check(`${route}: the engine mounted from the real hook (rims + haze)`, () => {
    assert.ok(mounted, 'no rim slab and haze canvas within 90 s of load');
    assert.ok(state.rims > 0, 'no rim canvas');
    assert.ok(state.haze > 0, 'no haze canvas');
  });
  check(`${route}: CSS carriers animate`, () => {
    if (state.carrierAnims.length === 0) return; // a route whose hosts all hold haze canvases carries none
    assert.ok(
      state.carrierAnims.every((a) => /^jelly-(drift|current):running$/.test(a)),
      state.carrierAnims.join(', '),
    );
  });

  const sample = await hazeSample();
  check(`${route}: the haze shows currents (interior alpha sd ≥ ${MIN_INTERIOR_SD})`, () => {
    assert.ok(sample, 'no haze canvas to sample');
    assert.ok(
      sample.sd >= MIN_INTERIOR_SD,
      `interior alpha sd ${sample.sd.toFixed(2)} on ${sample.size}: a flat veil`,
    );
  });

  const name = `${route}: the haze still moves after ${IDLE_AFTER_MS / 1000} s without input`;
  if (gpu.software) {
    const why = `software GL (${gpu.renderer}): the governor legitimately sheds to static haze`;
    skips.push(name);
    annotateSkip('jelly-real-app', `${name} — ${why}`);
    console.log(`SKIP ${name} — ${why}`);
  } else {
    await page.waitForTimeout(IDLE_AFTER_MS + 15_000);
    const a = await hazeSample();
    await page.waitForTimeout(1000);
    const b = await hazeSample();
    check(name, () =>
      assert.ok(a && b && a.hash !== b.hash, 'haze canvas identical 1 s apart: frozen'),
    );
  }
}

await browser.close();
console.log(
  `\n${failures.length ? 'FAILED' : 'OK'} — ${failures.length} failed, ${skips.length} skipped${failures.length ? `: ${failures.join('; ')}` : ''}`,
);
process.exit(failures.length ? 1 : 0);
