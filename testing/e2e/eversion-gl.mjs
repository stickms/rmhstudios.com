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
import { decodeImage, ssim } from './lib/image-metrics.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gl = join(root, 'lib/eversion/gl');
const outDir = process.env.EVERSION_GL_OUT ?? join(tmpdir(), 'eversion-gl');
mkdirSync(outDir, { recursive: true });
/** EVERSION_GL_ONLY=t27 skips the T23 sections (compile, projections, parity, normals, sides) while iterating. */
const T27_ONLY = process.env.EVERSION_GL_ONLY === 't27';

/** S#27's target and the hard floor under SwiftShader (see the header). */
const TOL_TARGET = 1e-4;
const TOL_HARD = 1e-3;
const NORMAL_HARD_DEG = 1.5;
/** Floors on executed checks (see the end of the file); 86 measured on a Chromium-only run (Firefox and WebKit absent). */
const MIN_CHECKS_FULL = 80;
const MIN_CHECKS_T27 = 10;

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
let executed = 0;
function check(name, ok, detail = '') {
  executed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}
const pct = (x) => `${(x * 100).toFixed(2)}%`;
/**
 * Defects the suite has found and does not yet fix. A listed check that fails is reported XFAIL and does not fail
 * the run; one that PASSES fails the run ("remove it from KNOWN_GAPS") so the list can only shrink.
 */
const KNOWN_GAPS = new Map([]);
function checkKnown(key, name, ok, detail = '') {
  const why = KNOWN_GAPS.get(key);
  if (!why) return check(name, ok, detail);
  if (ok) return check(`${name}  [KNOWN_GAPS entry "${key}" now passes: remove it]`, false, detail);
  console.log(`XFAIL ${name}  (${detail}) — ${why}`);
}

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

for (const [name, type] of T27_ONLY
  ? []
  : [
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

  const png = (url) => Buffer.from(url.split(',')[1], 'base64');
  const compiled = await t('compileLog');
  check('shaders compile and link on chromium', compiled.webgl2 && compiled.logs.length === 0, compiled.logs.join(' | ') || compiled.renderer);

  /* ── 2. every projection × e ─────────────────────────────────────────────── */
  if (!T27_ONLY) {
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

  }

  /* ── 6. T27: end-state orientation and centring (spec §4.5) ──────────────── */
  // The AFTER side is read through the REAL M_after = afterDomainTransform(R, SPIN_AXIS, alignAngle(R)),
  // at e = 1 with the spin on the timeline's landing angle (θ_align + whole turns) and the tilt level. The page
  // is an asymmetric card (see gl-page.ts#asymCard): cyan disc at the page centre, magenta up-arrow above it,
  // red left, green right, blue below.
  const shots = join(outDir, 'gl27');
  mkdirSync(shots, { recursive: true });
  const shot = (name, dataUrl) => writeFileSync(join(shots, name), png(dataUrl));
  const allProjections = await page.evaluate(() => window.__g.projections);
  const orient = await t('orientation');
  console.log(
    `      real orientation: theta_align = ${orient.thetaAlign.toExponential(2)} rad; M_after = [${Array.from(orient.mAfter).map((x) => x.toFixed(3)).join(' ')}]`,
  );
  const CENTRE_PX = 3;
  const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'none');
  const orientationOk = (m, vw, vh) => {
    const c = m.cyan;
    const why = [];
    if (!(c.n > 50)) why.push(`centre disc missing (n=${c.n})`);
    const off = Math.hypot(c.x - vw / 2, c.y - vh / 2);
    if (!(off <= CENTRE_PX)) why.push(`centre ${f1(off)} px off`);
    if (!(m.magenta.n > 50 && m.magenta.y < c.y - 20 && Math.abs(m.magenta.x - c.x) <= CENTRE_PX)) why.push('arrow not above the centre');
    if (!(m.magenta.widthTip < m.magenta.widthNeck)) why.push('arrow head is not on top');
    if (!(m.red.n > 50 && m.red.x < c.x - 20)) why.push('red not on the left');
    if (!(m.green.n > 50 && m.green.x > c.x + 20)) why.push('green not on the right');
    if (!(m.blue.n > 50 && m.blue.y > c.y + 20)) why.push('blue not below');
    return { off, why };
  };
  for (const [vw, vh] of [
    [640, 400],
    [390, 844],
  ]) {
    const res = [];
    for (const id of allProjections) {
      await t('setView', vw, vh);
      await t('init', 'mid');
      await t('prime', id, false, { lut: 'bucket', orientation: 'real' });
      await t('asymCards', id);
      for (const turns of [0, 1]) {
        const spin = orient.thetaAlign + turns * 2 * Math.PI;
        const r = await t('markers', { wrap: 1, unwrap: 1, evert: 1, spin, tilt: 0, afterMix: 1 });
        shot(`end-${id}-${vw}x${vh}-spin${turns}.png`, r.png);
        const v = orientationOk(r.markers, vw, vh);
        res.push(`${id}${turns ? '+2pi' : ''} ${v.off.toFixed(1)}px${r.err ? ` GLERR ${r.err}` : ''}`);
        check(`T27 ${id} ${vw}x${vh} e=1 spin=θ_align${turns ? '+2π' : ''}: AFTER centre on the centre, arrow up, not mirrored`, v.why.length === 0 && r.err === 0, v.why.join('; '));
      }
    }
    console.log(`      end-state centre offsets at ${vw}x${vh}: ${res.join(', ')}`);
  }
  // Sensitivity control: without the mirror correction (M_after = I) the same test must FAIL, or it proves nothing.
  {
    await t('setView', 640, 400);
    await t('init', 'mid');
    await t('prime', 'mercator', false, { lut: 'bucket', orientation: 'identity' });
    await t('asymCards', 'mercator');
    const r = await t('markers', { wrap: 1, unwrap: 1, evert: 1, spin: orient.thetaAlign, tilt: 0, afterMix: 1 });
    shot('control-identity-mercator.png', r.png);
    const v = orientationOk(r.markers, 640, 400);
    check('T27 control: with M_after = I the orientation test fails (it can see a mirror)', v.why.length > 0, v.why.join('; ') || 'passed — the test is blind');
  }
  // Diagnosis of T23's off-centre "AFT…": its e = 1 frames use spin 0.6·e + 0.2 = 0.8 rad and tilt 0.3, not the
  // landing angle, so the page centre is 0.8 rad round the globe. The fixture's own text layout is not at fault.
  {
    await t('setView', 640, 400);
    await t('init', 'mid');
    await t('prime', 'mercator', false, { lut: 'bucket', orientation: 'real' });
    await t('asymCards', 'mercator');
    const t23 = await t('markers', { wrap: 1, unwrap: 1, evert: 1, spin: 0.8, tilt: 0.3, afterMix: 1 });
    shot('t23-frame-params-spin0.8.png', t23.png);
    const off = Math.hypot(t23.markers.cyan.x - 320, t23.markers.cyan.y - 200);
    console.log(`      T23's e=1 frame (spin 0.8, tilt 0.3): the AFTER page centre sits ${f1(off)} px from the viewport centre; at spin = θ_align it sits within ${CENTRE_PX} px (checked above)`);
    check("T27 T23's off-centre e=1 frame is its spin/tilt (page centre > 50 px off), not a centring error", off > 50, `${f1(off)} px`);
  }

  // Diagnostic only (no assertion): the morph between the endpoints, for review in `gl27/`.
  for (const id of ['mercator', 'lambert']) {
    await t('setView', 640, 400);
    await t('init', 'mid');
    await t('prime', id, true, { lut: 'bucket', orientation: 'real' });
    await t('asymCards', id);
    for (const [name, patch] of [
      ['wrap25', { wrap: 0.25, unwrap: 1, evert: 0, spin: 0.3, tilt: 0.2 }],
      ['wrap50', { wrap: 0.5, unwrap: 1, evert: 0, spin: 0.3, tilt: 0.2 }],
      ['unwrap75', { wrap: 1, unwrap: 0.75, evert: 1, spin: orient.thetaAlign, tilt: 0 }],
      ['unwrap50', { wrap: 1, unwrap: 0.5, evert: 1, spin: orient.thetaAlign, tilt: 0 }],
      ['unwrap25', { wrap: 1, unwrap: 0.25, evert: 1, spin: orient.thetaAlign, tilt: 0 }],
    ]) {
      const r = await t('frame', { ...patch, afterMix: 1 }, true);
      shot(`morph-${id}-${name}.png`, r.png);
    }
  }

  /* ── 6b. mesh fix: mid-UNWRAP and mid-WRAP frames, mercator / lambert / peirce, for review in `meshfix/` ───── */
  // A smear band is a column or row of triangles stretched across the page (a page cut inside a triangle). The
  // asymmetric card has 1-px grid lines, so a stretch shows as a wide solid streak; the structural guarantee is
  // checked in lib/eversion/__tests__/mesh-layout.test.ts (no triangle spans > 30% of the page in either layout).
  const fixDir = join(outDir, 'meshfix');
  mkdirSync(fixDir, { recursive: true });
  for (const [vw, vh] of [
    [640, 400],
    [390, 844],
  ]) {
    for (const id of ['mercator', 'lambert', 'peirce']) {
      await t('setView', vw, vh);
      await t('init', 'mid');
      await t('prime', id, true, { lut: 'bucket', orientation: 'real' });
      await t('asymCards', id);
      for (const pct25 of [25, 50, 75]) {
        const r = await t('frame', { wrap: 1, unwrap: pct25 / 100, evert: 1, spin: orient.thetaAlign, tilt: 0, afterMix: 1 }, true);
        writeFileSync(join(fixDir, `unwrap-${id}-${vw}x${vh}-${pct25}.png`), png(r.png));
        check(`mesh fix: ${id} ${vw}x${vh} unwrap ${pct25}% renders without GL errors`, r.err === 0);
      }
      const w = await t('frame', { wrap: 0.25, unwrap: 1, evert: 0, spin: 0.3, tilt: 0.2, afterMix: 1 }, true);
      writeFileSync(join(fixDir, `wrap-${id}-${vw}x${vh}-25.png`), png(w.png));
    }
  }

  /* ── 7. T27: pixel-exact endpoints on the GPU (S#15) ──────────────────────── */
  // wrap = 0 must BE the BEFORE page, and the UNWRAP end the AFTER page: mean |Δ| per channel ≤ 2/255
  // (or SSIM ≥ 0.99). The cards carry 1-px grid lines and text, so a sub-pixel shift shows up in both.
  const MEAN_ABS_MAX = 2;
  const SSIM_MIN = 0.99;
  const FLAT = { wrap: 0, unwrap: 1, evert: 0, spin: 0, tilt: 0, afterMix: 1 };
  const UNWRAPPED = { wrap: 1, unwrap: 0, evert: 1, tilt: 0, afterMix: 1, spin: orient.thetaAlign };
  for (const [vw, vh] of [
    [1440, 900],
    [390, 844],
  ]) {
    for (const id of allProjections) {
      await t('setView', vw, vh);
      await t('init', 'mid');
      await t('prime', id, false, { lut: 'bucket', orientation: 'real' });
      const cards = await t('asymCards', id);
      for (const [label, patch, slot] of [
        ['wrap = 0 (BEFORE)', FLAT, 'before'],
        ['UNWRAP end (AFTER)', UNWRAPPED, 'after'],
      ]) {
        const r = await t('compare', patch, slot);
        const frame = await decodeImage(png(r.png));
        const card = await decodeImage(png(cards[slot]));
        const s = ssim(frame, card);
        const tag = `${slot}-${id}-${vw}x${vh}`;
        shot(`flat-${tag}.png`, r.png);
        console.log(`      ${id} ${vw}x${vh} ${label}: mean |Δ| ${r.mean.toFixed(3)}/255, max ${r.max.toFixed(0)} at ${JSON.stringify(r.worstAt)}, ${pct(r.offShare)} px off by > 8, SSIM ${s.toFixed(4)}`);
        checkKnown(
          `S#15 ${id} ${vw}x${vh}`,
          `S#15 ${id} ${vw}x${vh}: ${label} equals the page (mean |Δ| ≤ ${MEAN_ABS_MAX}/255 or SSIM ≥ ${SSIM_MIN})`,
          r.err === 0 && (r.mean <= MEAN_ABS_MAX || s >= SSIM_MIN),
          `mean ${r.mean.toFixed(2)}, SSIM ${s.toFixed(4)}`,
        );
      }
    }
  }

  /* ── 8. T27: the cached (bucket) LUT against the viewport's own fit ───────── */
  // The controller posts the LUT baked at the aspect BUCKET; the renderer takes no fit at all (the LUT's UVs
  // are the only place a fit enters, and the flat position AND the page sample both come from them), so the
  // flat endpoint cannot disagree with itself. What a bucket≠viewport aspect does change is WHERE on the page
  // each sphere point lands; that is the number below.
  for (const [vw, vh] of [
    [1440, 900],
    [390, 844],
  ]) {
    await t('setView', vw, vh);
    await t('init', 'mid');
    const line = [];
    let worst = 0;
    for (const id of allProjections) {
      const d = await t('lutFitDelta', id);
      worst = Math.max(worst, d.max);
      line.push(`${id} max ${d.max.toFixed(2)} / p99 ${d.p99.toFixed(2)} px`);
    }
    const d0 = await t('lutFitDelta', allProjections[0]);
    console.log(`      ${vw}x${vh}: aspect ${d0.viewportAspect.toFixed(4)}, bucket ${d0.bucket}/64 = ${d0.bucketAspect.toFixed(4)}; LUT(bucket) vs LUT(exact fit) page offset: ${line.join('; ')}`);
    // Flat endpoint with the EXACT-fit LUT as a cross-check: both must be pixel-exact.
    const worstFlat = [];
    for (const id of allProjections) {
      await t('init', 'mid');
      await t('prime', id, false, { lut: 'exact', orientation: 'real' });
      await t('asymCards', id);
      const r = await t('compare', FLAT, 'before');
      worstFlat.push(r.mean);
    }
    console.log(`      ${vw}x${vh}: flat endpoint with the exact-fit LUT, mean |Δ|/255 per projection: ${worstFlat.map((x) => x.toFixed(3)).join(' ')}`);
    // The renderer never takes a fit: position and page sample both come from the LUT it was handed, so the
    // flat endpoint is as exact with the bucket LUT as with the exact-fit one. Compare the two.
    const bucketFlat = [];
    for (const id of allProjections) {
      await t('init', 'mid');
      await t('prime', id, false, { lut: 'bucket', orientation: 'real' });
      await t('asymCards', id);
      bucketFlat.push((await t('compare', FLAT, 'before')).mean);
    }
    const worstGap = Math.max(...bucketFlat.map((x, i) => Math.abs(x - worstFlat[i])));
    check(`S#15 ${vw}x${vh}: the flat endpoint is as exact with the bucket LUT as with the exact-fit LUT`, worstGap <= 1, `worst difference in mean |Δ| ${worstGap.toFixed(3)}/255`);
  }

  const realErrors = errors.filter((e) => !/read back without waiting on a fence|GPU stall due to ReadPixels/i.test(e));
  check('no console errors or warnings', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

// A run that skipped its way to green has compared nothing. Firefox and WebKit may be absent (their SKIP
// lines are explicit and expected), but the Chromium sections are not optional: require a floor on the number
// of checks that actually ran.
const MIN_CHECKS = T27_ONLY ? MIN_CHECKS_T27 : MIN_CHECKS_FULL;
if (executed < MIN_CHECKS) {
  check(`at least ${MIN_CHECKS} checks executed`, false, `only ${executed} ran - sections were skipped`);
}

console.log(failures === 0 ? '\nall eversion GL checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
