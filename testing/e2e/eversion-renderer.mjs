// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion renderer core (T24) — headless Chromium acceptance check.
//
//   node testing/e2e/eversion-renderer.mjs
//
//   CHROMIUM_PATH=/path/to/chrome node testing/e2e/eversion-renderer.mjs
//   (default: Playwright's own Chromium, else /opt/pw-browsers/chromium-*/chrome-linux/chrome)
//
// Needs no dev server and no build: it bundles a tiny test page with esbuild
// (lib/eversion/gl/__fixtures__/renderer-page.ts), serves it from a fake origin
// through Playwright's request interception, and loads it with
// `?eversion-debug=1` so the renderer's `window.__eversion.renderer` debug slot
// registers. WebGL2 comes from SwiftShader, so it runs on a GPU-less box.
//
// The page is bundled with ONE alias, so the renderer under test is the real
// `createRenderer` with the REAL shaders and a fixture mesh:
//   ../mesh      → __fixtures__/local-mesh.ts      (a UV sphere; T09 is separate)
//
// ## What it asserts (the T24 acceptance)
//
//  1. The centre pixel is the `before` colour at rest (flat page) and on the
//     un-everted globe; the `after` colour at e = 1 — both by the snapshot and by
//     the debug slot's `pauseAt(1)`. Outside the globe it is the veil; with
//     bgAlpha 0 it is transparent.
//  2. A real ImageBitmap lands the right way up through the LUT (four quadrants).
//  3. `draw()` makes ≤ 2 draw calls.
//  4. `debugEvaluate` (transform feedback) is the round sphere at e = 0 and stays on it at e = 1.
//  5. `draw()` allocates nothing: the JS heap after GC is flat across 1000 draws
//     (CDP; best-effort, allowed a small slack for GC bookkeeping).
//  6. `release()` returns `counters().live` to its post-construction baseline and
//     `dispose()` takes every counter to zero.
//  7. A lost context reaches `onContextLost`, and later calls are safe no-ops.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gl = join(root, 'lib/eversion/gl');

/** Aliases the renderer's two neighbours to fixtures (see the header). */
const aliasPlugin = {
  name: 'eversion-fixtures',
  setup(b) {
    b.onResolve({ filter: /^\.\.\/mesh$/ }, (a) =>
      a.importer.endsWith('gl/renderer.ts')
        ? { path: join(gl, '__fixtures__/local-mesh.ts') }
        : undefined,
    );
  },
};

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
const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const fmt = (c) => `[${c.join(',')}]`;

const bundle = await build({
  entryPoints: [join(gl, '__fixtures__/renderer-page.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  plugins: [aliasPlugin],
  logLevel: 'error',
});
const script = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><title>eversion renderer</title><body style="margin:0"><script>${script.replaceAll('</script', '<\\/script')}</script>`;

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--js-flags=--expose-gc',
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  await page.route('http://eversion.test/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  await page.goto('http://eversion.test/?eversion-debug=1');

  const t = (fn, ...args) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, args]);

  const wind = await t('windingErrors');
  check(
    'local test mesh honours the winding contract',
    wind.bad === 0,
    `${wind.bad} of ${wind.triangles} triangles`,
  );

  const init = await t('init');
  check('renderer constructs on a DOM canvas', init.baselineLive > 0, `live=${init.baselineLive}`);
  check('registers the `renderer` debug slot', init.debugSlots.includes('renderer'));
  await t('prime');
  await t('solid');

  const { expected } = await page.evaluate(() => window.__t);
  const c = await t('centre');
  // The flat page is the capture untouched (exact); on the globe the pages are LIT (Lambert, and the back side is
  // darkened and tinted), so those are compared by hue: cosine similarity of the RGB vectors.
  const hue = (a, b) => {
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return dot / (Math.hypot(...a) * Math.hypot(...b) || 1);
  };
  check(
    'rest: centre pixel is `before`',
    near(c.rest, expected.before),
    `${fmt(c.rest)} vs ${fmt(expected.before)}`,
  );
  check(
    'globe at e=0: centre pixel is `before` (lit)',
    hue(c.sphere, expected.before) > 0.99,
    fmt(c.sphere),
  );
  check(
    'globe at e=1: centre pixel is `after` (lit)',
    hue(c.flipped, expected.after) > 0.97,
    `${fmt(c.flipped)} vs ${fmt(expected.after)}`,
  );
  check('debug pauseAt(1) forces the flip', hue(c.forced, expected.after) > 0.97, fmt(c.forced));
  check('outside the globe is the veil', near(c.outside, expected.veil), fmt(c.outside));
  check('bgAlpha 0 clears to transparent', near(c.clear, [0, 0, 0]), fmt(c.clear));

  const q = await t('quadrants');
  check(
    'ImageBitmap lands right way up through the LUT',
    near(q.tl, [255, 0, 0]) &&
      near(q.tr, [0, 255, 0]) &&
      near(q.bl, [0, 0, 255]) &&
      near(q.br, [255, 255, 0]),
    JSON.stringify(q),
  );

  const maxCalls = await t('maxDrawCallsPerFrame');
  check('draw() makes at most 2 draw calls', maxCalls >= 1 && maxCalls <= 2, `max=${maxCalls}`);

  const ev = await t('evaluate');
  // 1e-3, not T23's 1e-4: this is GPU sin/cos (SwiftShader measured 3.7e-4); the real parity test owns the tighter bound.
  check(
    'debugEvaluate via transform feedback: sphere at e=0, unit sphere at e=1',
    ev.length === ev.expected && ev.worst < 1e-3 && ev.worstNorm < 1e-2,
    `worst=${ev.worst.toExponential(2)} norm=${ev.worstNorm.toExponential(2)}`,
  );

  const scaled = await t('setDprScale', 0.75);
  check(
    'setDprScale resizes the drawing buffer only',
    scaled.w === 192 && scaled.h === 120,
    `${scaled.w}x${scaled.h}`,
  );
  await t('setDprScale', 1);

  // Heap: warm up (JIT, shader uniform caches), GC, measure 1000 draws, GC.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await t('drawMany', 200);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'JSHeapUsedSize').value;
  };
  await cdp.send('Performance.enable');
  // Judged on the BEST of three passes (as the timeline's tick check is): the JS heap metric drifts by a few kB on
  // its own (JIT feedback vectors, the inspector), and a single pass sat just over the line on a loaded box. A real
  // leak of even one small object per draw is >= 16 kB on EVERY pass, so the best pass still exposes it.
  const deltas = [];
  for (let pass = 0; pass < 3; pass++) {
    const before = await heap();
    await t('drawMany', 1000);
    deltas.push((await heap()) - before);
  }
  const delta = deltas.reduce((best, d) => (Math.abs(d) < Math.abs(best) ? d : best), deltas[0]);
  check(
    'draw() allocates nothing across 1000 draws',
    Math.abs(delta) < 8 * 1024,
    `heap delta ${delta} B (passes: ${deltas.join(', ')})`,
  );

  const live = await t('counters');
  await t('release');
  const released = await t('counters');
  check(
    'release() returns live objects to the construction baseline',
    released.live === init.baselineLive,
    `baseline ${init.baselineLive}, after release ${released.live} (before ${live.live})`,
  );
  // Soak: 20 navigations (prime, textures, draw, release) must each return to the construction baseline.
  let soakOk = true;
  let soakDetail = '';
  for (let i = 0; i < 20; i++) {
    await t('prime');
    await t('solid');
    await t('drawMany', 3);
    await t('release');
    const live = (await t('counters')).live;
    if (live !== init.baselineLive) {
      soakOk = false;
      soakDetail = `cycle ${i + 1}: live ${live} vs baseline ${init.baselineLive}`;
      break;
    }
  }
  check('20 navigations in a row return to the same baseline', soakOk, soakDetail);

  await t('dispose');
  const z = await t('counters');
  const balanced = ['buffers', 'textures', 'programs', 'vertexArrays'].every(
    (k) => z[k].created === z[k].deleted && z[k].created > 0,
  );
  check('dispose() takes every counter to zero', z.live === 0 && balanced, JSON.stringify(z));

  // A fresh renderer for the context-loss case.
  await t('init');
  await t('prime');
  const lost = await t('loseContext');
  check(
    'context loss reaches onContextLost (and later draws are safe)',
    lost.supported && lost.calls === 1,
    `calls=${lost.calls}`,
  );

  const glErrors = errors.filter(
    (e) => !/lost|CONTEXT_LOST|read back without waiting on a fence/i.test(e),
  );
  check('no console errors or warnings', glErrors.length === 0, glErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nall renderer checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
