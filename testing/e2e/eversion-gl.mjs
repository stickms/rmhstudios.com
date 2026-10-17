// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion shaders (T23) — headless Chromium check: compile, render, parity,
// two-sidedness. T27 extends this file.
//
//   node testing/e2e/eversion-gl.mjs
//
//   CHROMIUM_PATH=/path/to/chrome   (default: Playwright's own, else /opt/pw-browsers)
//   EVERSION_GL_OUT=/some/dir       (screenshots; default: <tmpdir>/eversion-gl)
//
// No dev server, no build: it bundles lib/eversion/gl/__fixtures__/gl-page.ts with
// esbuild, serves it from a fake origin through Playwright's request interception
// and loads it with `?eversion-debug=1`. WebGL2 comes from SwiftShader, so it runs
// on a GPU-less box. The renderer, mesh, projections, LUT baker and SHADERS are the
// real modules, including the TS oracle (thurston.ts).
//
// ## What it asserts
//
//  1. (T23 acceptance) The real shaders compile and link; also on Firefox and
//     WebKit when Playwright has them installed (skipped otherwise).
//  2. All five projections render at e ∈ {0, .25, .5, .75, 1} with no GL error;
//     PNGs are written for review.
//  3. (S#27) `debugEvaluate` — F by transform feedback — against the oracle at 64
//     values of e, every mesh vertex. Target 1e-4. SwiftShader's sin/cos are
//     less accurate than a GPU's (T24 measured 3.7e-4), so the hard failure is
//     TOL_HARD (1e-3) and the 1e-4 figure is reported, not hidden.
//  4. The normal, against the oracle's (degrees).
//  5. (S#28) Two-sidedness with solid textures: red `before`, blue `after`; at
//     e = 0 there is no blue, at e = 1 no red, in between both; nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gl = join(root, 'lib/eversion/gl');
const outDir = process.env.EVERSION_GL_OUT ?? join(tmpdir(), 'eversion-gl');
mkdirSync(outDir, { recursive: true });

/** S#27's target and the hard floor under SwiftShader (see the header). */
const TOL_TARGET = 1e-4;
const TOL_HARD = 1e-3;
const NORMAL_HARD_DEG = 1.5;

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
const pct = (x) => `${(x * 100).toFixed(2)}%`;

const bundle = await build({
  entryPoints: [join(gl, '__fixtures__/gl-page.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  logLevel: 'error',
});
const script = bundle.outputFiles[0].text;
const html = `<!doctype html><meta charset="utf-8"><title>eversion gl</title><body style="margin:0"><script>${script.replaceAll('</script', '<\\/script')}</script>`;

async function openPage(browser, url = 'http://eversion.test/?eversion-debug=1') {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  await page.route('http://eversion.test/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  await page.goto(url);
  return { page, errors };
}

const g = (page) => (fn, ...args) => page.evaluate(([f, a]) => window.__g[f](...a), [fn, args]);

/* ── 1. compile on every engine Playwright has ────────────────────────────── */

for (const [name, type] of [
  ['firefox', firefox],
  ['webkit', webkit],
]) {
  let exe = '';
  try {
    exe = type.executablePath();
  } catch {
    /* not installed */
  }
  if (!exe || !existsSync(exe)) {
    console.log(`SKIP  shaders compile on ${name}  (browser not installed)`);
    continue;
  }
  const b = await type.launch();
  try {
    const { page } = await openPage(b);
    const r = await g(page)('compileLog');
    check(`shaders compile and link on ${name}`, r.webgl2 && r.logs.length === 0, r.logs.join(' | '));
  } finally {
    await b.close();
  }
}

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
  const { page, errors } = await openPage(browser);
  const t = g(page);

  const compiled = await t('compileLog');
  check('shaders compile and link on chromium', compiled.webgl2 && compiled.logs.length === 0, compiled.logs.join(' | ') || compiled.renderer);

  /* ── 2. every projection × e ─────────────────────────────────────────────── */
  const es = [0, 0.25, 0.5, 0.75, 1];
  const projections = await page.evaluate(() => window.__g.projections);
  await t('init', 'mid');
  for (const id of projections) {
    await t('prime', id, true);
    await t('cards');
    const bad = [];
    for (const e of es) {
      const r = await t('frame', { wrap: 1, unwrap: 1, evert: e, spin: 0.6 * e + 0.2, tilt: 0.3, ripple0Age: 0.25 + e * 0.1, afterMix: 1 }, true);
      if (r.err !== 0) bad.push(`e=${e}: GL error 0x${r.err.toString(16)}`);
      writeFileSync(join(outDir, `${id}-e${String(e).replace('.', '')}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    }
    // The morph itself: flat, mid-curl, sphere.
    for (const [label, patch] of [
      ['flat', { wrap: 0, unwrap: 1 }],
      ['curl', { wrap: 0.5, unwrap: 1 }],
    ]) {
      const r = await t('frame', { ...patch, evert: 0, spin: 0, tilt: 0 }, true);
      if (r.err !== 0) bad.push(`${label}: GL error 0x${r.err.toString(16)}`);
      writeFileSync(join(outDir, `${id}-${label}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    }
    check(`${id}: renders e = 0, .25, .5, .75, 1 and the morph without GL errors`, bad.length === 0, bad.join(', '));
  }
  console.log(`      screenshots in ${outDir}`);

  /* ── 3. S#27: transform-feedback F against the oracle ─────────────────────── */
  await t('init', 'high');
  await t('prime', 'equirect', false);
  console.log(`      GL sin/cos worst abs error on this stack: ${(await t('trigError')).toExponential(2)}`);
  const p = await t('parity');
  console.log(
    `      parity: ${p.vertices} vertices x ${p.es} e; worst ${p.worst.toExponential(2)} at ${JSON.stringify(p.worstAt)}; rms ${p.rms.toExponential(2)}; ${p.over1e4} samples > 1e-4, ${p.over1e3} > 1e-3; ${p.ms.toFixed(0)} ms`,
  );
  check('S#27 transform feedback produced finite values', p.nan === 0, `${p.nan} non-finite`);
  check(`S#27 max |F_gl − F_oracle| ≤ ${TOL_HARD} (target ${TOL_TARGET})`, p.worst <= TOL_HARD, `worst ${p.worst.toExponential(2)}`);
  console.log(
    p.worst <= TOL_TARGET
      ? '      S#27 meets the 1e-4 target'
      : `      NOTE: S#27 does NOT meet the 1e-4 target on this GL stack (worst ${p.worst.toExponential(2)})`,
  );

  /* ── 4. the normal ───────────────────────────────────────────────────────── */
  const n = await t('normals');
  console.log(
    `      normals: ${n.samples} samples; worst ${n.worstDeg.toFixed(3)} deg at ${JSON.stringify(n.worstAt)}; ${n.over1deg} over 1 deg; worst away from the poles ${n.worstMidLatDeg.toFixed(3)} deg`,
  );
  console.log('      per e: ' + n.perE.map((r) => `${r.e}:${r.worstDeg.toFixed(1)}deg/${pct(r.flipped)}flipped`).join(' '));
  check(`normal within ${NORMAL_HARD_DEG} deg of the oracle's`, n.worstDeg <= NORMAL_HARD_DEG, `worst ${n.worstDeg.toFixed(3)} deg`);

  /* ── 5. S#28: two-sidedness ──────────────────────────────────────────────── */
  const RED = [1, 0, 0, 1];
  const BLUE = [0, 0, 1, 1];
  for (const id of ['equirect', 'mercator']) {
    await t('init', 'mid');
    await t('prime', id, false);
    await t('solid', RED, BLUE);
    const h = {};
    for (const e of es) {
      h[e] = await t('histogram', { wrap: 1, unwrap: 1, evert: e, spin: 0.4, tilt: 0.2, afterMix: 1 });
      writeFileSync(join(outDir, `solid-${id}-e${String(e).replace('.', '')}.png`), Buffer.from(h[e].png.split(',')[1], 'base64'));
    }
    for (const e of es) {
      if (id === 'equirect' && (e === 0 || e === 1)) console.log(`      e=${e} stray pixels: blue ${JSON.stringify(h[e].blueAt)} red ${JSON.stringify(h[e].redAt.slice(0, 6))}`);
    }
    const line = es.map((e) => `e=${e}: red ${pct(h[e].red)} blue ${pct(h[e].blue)}`).join(' | ');
    console.log(`      ${id}: ${line}`);
    check(`S#28 ${id}: e = 0 has 0% blue (and is red)`, h[0].blue === 0 && h[0].red > 0.05, `blue ${pct(h[0].blue)} red ${pct(h[0].red)}`);
    check(`S#28 ${id}: e = 1 has 0% red (and is blue)`, h[1].red === 0 && h[1].blue > 0.05, `red ${pct(h[1].red)} blue ${pct(h[1].blue)}`);
    check(`S#28 ${id}: e = 0.25 is still the before side`, h[0.25].red > 0.2, `red ${pct(h[0.25].red)}`);
    for (const e of [0.5, 0.75]) {
      check(`S#28 ${id}: e = ${e} shows both sides`, h[e].red > 0.005 && h[e].blue > 0.005, `red ${pct(h[e].red)} blue ${pct(h[e].blue)}`);
    }
    const worstOther = Math.max(...es.map((e) => h[e].other));
    check(`S#28 ${id}: no colour but red, blue, glass or veil`, worstOther < 0.02, `other ≤ ${pct(worstOther)} (antialiased sheet edges)`);
    check(`S#28 ${id}: no GL errors`, es.every((e) => h[e].err === 0));
  }

  const realErrors = errors.filter((e) => !/read back without waiting on a fence|GPU stall due to ReadPixels/i.test(e));
  check('no console errors or warnings', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nall eversion GL checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
