// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion END OF UNWRAP and the azimuthal wedge - headless Chromium check
// with screenshots to look at.
//
//   node testing/e2e/eversion-wedge.mjs
//   EVERSION_WEDGE_OUT=/some/dir   (screenshots; default: <tmpdir>/eversion-wedge)
//
// Bundles lib/eversion/gl/__fixtures__/gl-page.ts (the REAL renderer, shaders,
// mesh, LUTs and Timeline), serves it from a fake origin and drives it:
//
//  1. END OF UNWRAP: frames up to the end of UNWRAP. The run ends there, so the
//     last frame must be the flat AFTER page, pixel for pixel what a flat page
//     (`unwrap` 0) draws: no globe, no glass.
//  2. Lambert / stereographic / equirect mid-morph frames, for review of the
//     stretched wedge near the back point (it must read as glass, not as
//     smeared page). The numeric check is that they render without GL errors.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gl = join(root, 'lib/eversion/gl');
const outDir = process.env.EVERSION_WEDGE_OUT ?? join(tmpdir(), 'eversion-wedge');
mkdirSync(outDir, { recursive: true });

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

// Ramp pixels of the mask view that may touch a jump of more than half: a smooth falloff has none.
const MASK_JUMP_RATE = 0.02;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
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
const html = `<!doctype html><meta charset="utf-8"><title>eversion wedge</title><body style="margin:0;background:#3a4256"><script>${script.replaceAll('</script', '<\\/script')}</script>`;

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
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  await page.route('http://eversion.test/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  await page.goto('http://eversion.test/?eversion-debug=1');
  const t = (fn, ...args) => page.evaluate(([f, a]) => window.__g[f](...a), [fn, args]);

  await t('init', 'mid');
  await t('prime', 'equirect', true, { orientation: 'real' });
  await t('cards');

  // The end of UNWRAP: the run's last drawn frame is the flat AFTER page, exactly the frame a flat page
  // (`unwrap` 0) draws, with no globe left in it. Pixels are read back and compared to that reference.
  const pixelsOf = (draw) =>
    page.evaluate((fn) => {
      const r = window.__g[fn.name](...fn.args);
      const c = document.querySelector('canvas');
      const g = c.getContext('webgl2');
      const px = new Uint8Array(c.width * c.height * 4);
      g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
      let hash = 2166136261;
      let nonOpaque = 0;
      let aMin = 255;
      let aMax = 0;
      for (let i = 0; i < px.length; i += 4) {
        for (let k = 0; k < 4; k++) hash = Math.imul(hash ^ px[i + k], 16777619) >>> 0;
        if (px[i + 3] !== 255) nonOpaque++;
        if (px[i + 3] < aMin) aMin = px[i + 3];
        if (px[i + 3] > aMax) aMax = px[i + 3];
      }
      return { r, hash, nonOpaque, aMin, aMax };
    }, draw);
  const flat = await pixelsOf({
    name: 'frame',
    args: [{ wrap: 1, unwrap: 0, evert: 1, spin: 0.7, tilt: 0.2, afterMix: 1 }],
  });
  // The run now ENDS with UNWRAP and the final dissolve ends with it: the last frame is the flat page fully
  // dissolved (transparent canvas, the live page showing through), the one before it the same flat page at
  // a fraction of its opacity. Offsets are relative to that end.
  const offsets = [-200, -100, -20, 0];
  const rows = [];
  for (const off of offsets) {
    const row = await pixelsOf({ name: 'endFrame', args: [off] });
    rows.push({ off, ...row });
    await page.screenshot({ path: join(outDir, `end-${String(off + 200).padStart(4, '0')}.png`) });
  }
  for (const r of rows) {
    console.log(
      `      end${r.off >= 0 ? '+' : ''}${String(r.off).padStart(4)} ms  stage=${r.r.stage.padEnd(11)} unwrap=${r.r.unwrap.toFixed(3)} pageAlpha=${r.r.pageAlpha.toFixed(2)} hash=${r.hash} nonOpaque=${r.nonOpaque}`,
    );
  }
  check(
    'no GL error in any end-of-UNWRAP frame',
    rows.every((r) => r.r.err === 0),
  );
  const last = rows[rows.length - 1];
  const dissolved = await pixelsOf({
    name: 'frame',
    args: [
      { wrap: 1, unwrap: 0, evert: 1, spin: 0.7, tilt: 0.2, afterMix: 1, pageAlpha: 0, bgAlpha: 0 },
    ],
  });
  const half = await pixelsOf({
    name: 'frame',
    args: [
      {
        wrap: 1,
        unwrap: 0,
        evert: 1,
        spin: 0.7,
        tilt: 0.2,
        afterMix: 1,
        pageAlpha: 0.5,
        bgAlpha: 0.5,
      },
    ],
  });
  check(
    'the last frame is unwrap 0 with the page fully dissolved',
    last.r.unwrap === 0 && last.r.pageAlpha === 0,
  );
  check(
    'the last frame is pixel-identical to the flat page dissolved to nothing, and transparent everywhere',
    last.hash === dissolved.hash && last.aMax === 0,
    `${last.hash} vs ${dissolved.hash}, alpha max ${last.aMax}`,
  );
  check(
    'the flat AFTER page at full opacity is opaque everywhere (no globe, no glass, no hole)',
    flat.aMin === 255,
    `alpha min ${flat.aMin}`,
  );
  check(
    'mid-dissolve the flat page is one uniform half-transparent sheet (the clear colour dissolves with it, nothing pops)',
    half.aMin >= 126 && half.aMax <= 129,
    `alpha ${half.aMin}..${half.aMax}`,
  );
  check(
    'the dissolve is monotone through the last 200 ms',
    rows.every((r, i) => i === 0 || r.r.pageAlpha <= rows[i - 1].r.pageAlpha) &&
      rows.every((r, i) => i === 0 || r.r.unwrap <= rows[i - 1].r.unwrap),
    rows.map((r) => `${r.r.pageAlpha.toFixed(2)}/${r.r.unwrap.toFixed(3)}`).join(' '),
  );

  for (const id of ['lambert', 'stereographic', 'equirect']) {
    await t('prime', id, true, { orientation: 'real' });
    await t('cards');
    for (const [label, patch] of [
      ['wrap30', { wrap: 0.3, unwrap: 1 }],
      ['wrap45', { wrap: 0.45, unwrap: 1 }],
      ['wrap60', { wrap: 0.6, unwrap: 1 }],
      ['unwrap30', { wrap: 1, unwrap: 0.3 }],
      ['unwrap45', { wrap: 1, unwrap: 0.45 }],
      ['unwrap60', { wrap: 1, unwrap: 0.6 }],
    ]) {
      const r = await t('frame', { ...patch, evert: 0, spin: 0.3, tilt: 0.25, afterMix: 1 }, false);
      check(`${id} ${label}: renders without GL error`, r.err === 0);
      await page.screenshot({ path: join(outDir, `${id}-${label}.png`) });
    }
  }
  // The wedge mask itself, through the shader's mask view: it must be a smooth field. The old mask (the
  // per-vertex mismatch, the 2x2 derivative stretch, gl_FrontFacing) is full of one-pixel 0 -> 1 jumps along
  // triangle edges and quad blocks; the analytic cap jumps only where two sheets of the surface overlap.
  await t('init', 'mid', { maskView: true });
  for (const id of ['lambert', 'stereographic']) {
    await t('prime', id, true, { orientation: 'real' });
    await t('cards');
    for (const [label, patch] of [
      ['wrap30', { wrap: 0.3, unwrap: 1 }],
      ['wrap45', { wrap: 0.45, unwrap: 1 }],
      ['wrap60', { wrap: 0.6, unwrap: 1 }],
      ['unwrap30', { wrap: 1, unwrap: 0.3 }],
      ['unwrap45', { wrap: 1, unwrap: 0.45 }],
      ['unwrap60', { wrap: 1, unwrap: 0.6 }],
      ['evert03', { wrap: 1, unwrap: 1, evert: 0.03 }],
      ['evert50', { wrap: 1, unwrap: 1, evert: 0.5 }],
    ]) {
      const r = await t('maskStats', { ...patch, spin: 0.3, tilt: 0.25, afterMix: 1 });
      const rate = r.rampJumps / Math.max(r.rampPairs, 1);
      console.log(
        `      mask ${id} ${label}: covered ${r.covered}, ramp ${r.partial}, full ${r.full}, ramp steps >0.6: ${r.rampJumps} of ${r.rampPairs} (${(rate * 100).toFixed(2)}%), all jumps ${r.jumps}, worst ${r.worst.toFixed(2)}`,
      );
      check(`${id} ${label}: mask view renders without GL error`, r.err === 0);
      check(
        `${id} ${label}: the wedge mask is smooth (few one-pixel jumps)`,
        rate < MASK_JUMP_RATE,
        `${r.rampJumps} steps of ${r.rampPairs} ramp pairs`,
      );
    }
  }
  console.log(`      screenshots in ${outDir}`);
  const bad = errors.filter((e) => !/read back without waiting on a fence|GPU stall/i.test(e));
  check('no console errors or warnings', bad.length === 0, bad.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(
  failures === 0 ? '\nall end-of-UNWRAP and wedge checks passed' : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
