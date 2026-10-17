// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion POP and the azimuthal wedge - headless Chromium check with
// screenshots to look at.
//
//   node testing/e2e/eversion-pop.mjs
//   EVERSION_POP_OUT=/some/dir   (screenshots; default: <tmpdir>/eversion-pop)
//
// Bundles lib/eversion/gl/__fixtures__/gl-page.ts (the REAL renderer, shaders,
// mesh, LUTs and Timeline), serves it from a fake origin and drives it:
//
//  1. POP: frames from just before the reveal to the end. The empty glass globe
//     must condense, shrink onto the orb, swell while it fades, and the last
//     frame must be fully transparent.
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
const outDir = process.env.EVERSION_POP_OUT ?? join(tmpdir(), 'eversion-pop');
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
// A mid-grey page behind the (transparent after reveal) canvas so a faint glass shows up in the screenshots.
const html = `<!doctype html><meta charset="utf-8"><title>eversion pop</title><body style="margin:0;background:#3a4256"><script>${script.replaceAll('</script', '<\\/script')}</script>`;

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

  const offsets = [-20, 0, 40, 80, 120, 170, 200, 230, 260, 290, 300];
  const rows = [];
  for (const off of offsets) {
    const r = await t('popFrame', off);
    rows.push({ off, ...r });
    await page.screenshot({ path: join(outDir, `pop-${String(off + 100).padStart(4, '0')}.png`) });
  }
  for (const r of rows) {
    console.log(
      `      pop+${String(r.off).padStart(4)} ms  stage=${r.stage.padEnd(7)} glass=${r.glass.toFixed(2)} fade=${r.popFade.toFixed(2)} r=${r.radius.toFixed(1)} c=(${r.centreX.toFixed(0)},${r.centreY.toFixed(0)})`,
    );
  }
  check(
    'no GL error in any POP frame',
    rows.every((r) => r.err === 0),
  );
  const last = rows[rows.length - 1];
  check(
    'the last POP frame is fully faded and on the orb',
    last.popFade === 1 &&
      Math.abs(last.radius - last.orb.radius) < 1e-6 &&
      Math.abs(last.centreX - last.orb.cx) < 1e-6,
  );

  // The canvas is transparent after the reveal, so alpha is exactly where there is glass.
  const coverageAt = async (off) => {
    return page.evaluate((offset) => {
      window.__g.popFrame(offset);
      const c = document.querySelector('canvas');
      const g = c.getContext('webgl2');
      const px = new Uint8Array(c.width * c.height * 4);
      g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
      let covered = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 8) covered++;
      return covered / (px.length / 4);
    }, off);
  };
  const atReveal = await coverageAt(0);
  const mid = await coverageAt(150);
  const end = await coverageAt(300);
  console.log(
    `      coverage: reveal ${atReveal.toFixed(4)}, pop+150 ${mid.toFixed(4)}, end ${end.toFixed(4)}`,
  );
  check('the globe condenses: glass is present at pop+150', mid > 0.001, `covered ${mid}`);
  check('the last frame is invisible (no pixel above alpha 8/255)', end === 0, `covered ${end}`);

  for (const id of ['lambert', 'stereographic', 'equirect']) {
    await t('prime', id, true, { orientation: 'real' });
    await t('cards');
    for (const [label, patch] of [
      ['wrap25', { wrap: 0.25, unwrap: 1 }],
      ['wrap45', { wrap: 0.45, unwrap: 1 }],
      ['wrap70', { wrap: 0.7, unwrap: 1 }],
    ]) {
      const r = await t('frame', { ...patch, evert: 0, spin: 0.3, tilt: 0.25, afterMix: 1 }, false);
      check(`${id} ${label}: renders without GL error`, r.err === 0);
      await page.screenshot({ path: join(outDir, `${id}-${label}.png`) });
    }
  }
  console.log(`      screenshots in ${outDir}`);
  const bad = errors.filter((e) => !/read back without waiting on a fence|GPU stall/i.test(e));
  check('no console errors or warnings', bad.length === 0, bad.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nall POP checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
