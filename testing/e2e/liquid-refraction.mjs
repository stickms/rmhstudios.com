/** Refraction tier browser contract, no app or database needed.
 * CHROMIUM_PATH=/usr/bin/chromium node testing/e2e/liquid-refraction.mjs
 * LIQUID_BROWSER=firefox|webkit asserts the tier stays OFF there (frost only).
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import { decodeImage } from './lib/image-metrics.mjs';

const root = resolve(import.meta.dirname, '../..');
const out = process.env.LIQUID_GLASS_OUT ?? join(tmpdir(), 'rmh-liquid-refraction');
mkdirSync(out, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import {installLiquidRefraction,REFRACTION_BUDGET} from './lib/liquid/refraction-runtime';
    window.REFRACTION_BUDGET=REFRACTION_BUDGET;
    window.stopRefraction=installLiquidRefraction();`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const materialCss = readFileSync(join(root, 'app/liquid-glass.css'), 'utf8');
const browserName = process.env.LIQUID_BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
assert.ok(engine, 'known browser');
const supported = browserName === 'chromium';
const browser = await engine.launch({
  headless: true,
  ...(supported ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {}),
});
let checks = 0;
const check = (name, value) => {
  assert.ok(value, name);
  checks++;
  console.log(`PASS ${name}`);
};
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A loud, high-frequency backdrop so any bending of the rim is unmistakable.
  const panes = Array.from(
    { length: 8 },
    (_, i) =>
      `<article id="p${i}" class="glass-pane" style="left:${30 + (i % 4) * 235}px;top:${30 + Math.floor(i / 4) * 150}px">pane ${i}</article>`,
  ).join('');
  const markup = `<meta name="viewport" content="width=device-width, initial-scale=1"><style>
    @layer components; :root{--site-bg:#edf1f8;--site-text:#172334;--site-accent:#5792d2;--site-surface:#f6f8fc;--site-border:#9ca8bd;--site-radius:22px;--site-radius-sm:10px;--site-shadow:0 15px 40px #15203020;--site-shadow-sm:0 3px 10px #15203012;--site-glass-light:white;--glass-blur-factor:1}
    *{box-sizing:border-box} body{margin:0;min-height:1400px;font:16px system-ui;color:var(--site-text);
      background:repeating-linear-gradient(90deg,#d33 0 10px,#fff 10px 20px,#25c 20px 30px,#fff 30px 40px)}
    article{position:absolute;width:210px;height:120px;padding:16px}
    #huge{left:30px;top:340px;width:900px;height:700px}
    #off{left:30px;top:780px;width:200px;height:100px}
    #pill{left:300px;top:1100px;width:300px;height:56px;border-radius:999px}
    ${materialCss}</style>
    ${panes}
    <article id="huge" class="glass-pane">too large</article>
    <article id="off" class="glass-pane" data-liquid-material="off">opted out</article>
    <article id="pill" class="glass-chrome" data-liquid-refract="dispersive">dispersive pill</article>`;
  await page.route('https://rmh-refract.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: markup }),
  );
  await page.goto('https://rmh-refract.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  await settle();
  const refracted = () => page.$$eval('[data-liquid-refracted]', (n) => n.map((e) => e.id));

  if (!supported) {
    check(`${browserName}: no surface is refracted`, (await refracted()).length === 0);
    check(
      `${browserName}: no SVG defs host is created`,
      (await page.$$('[data-liquid-refraction-defs]')).length === 0,
    );
    check(`${browserName}: no page errors`, errors.length === 0);
    console.log(`\n${checks} checks passed (${browserName}: tier correctly absent).`);
    process.exit(0);
  }

  const budget = await page.evaluate(() => window.REFRACTION_BUDGET.maxSurfaces);
  let ids = await refracted();
  check(`applies to at most ${budget} visible surfaces`, ids.length === budget);
  check('oversized surface is never refracted', !ids.includes('huge'));
  check('opted-out surface is never refracted', !ids.includes('off'));
  check(
    'root reports the tier active',
    (await page.evaluate(() => document.documentElement.dataset.liquidRefraction)) === 'active',
  );
  const bf = await page.$eval('#p0', (e) => getComputedStyle(e).backdropFilter);
  check('computed backdrop-filter carries the url() filter', /url\(/.test(bf) && /blur/.test(bf));
  check(
    'each refracted surface has one displacement filter',
    (await page.$$eval('[data-liquid-refraction-defs] feDisplacementMap', (n) => n.length)) >=
      budget,
  );

  // Visual: the rim must bend the stripes; the interior must not.
  const shot = async (name) => {
    const buf = await page.locator('#p0').screenshot();
    writeFileSync(join(out, `${name}.png`), buf);
    return decodeImage(buf);
  };
  const withRefraction = await shot('refracted');
  await page.$eval('#p0', (e) => (e.style.backdropFilter = 'blur(9px) saturate(155%)'));
  await settle();
  const plain = await shot('plain');
  await page.$eval('#p0', (e) => (e.style.backdropFilter = ''));
  const band = (img, x0, x1) => {
    let d = 0;
    for (let y = 0; y < img.height; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        d += Math.abs(img.data[i] - plain.data[i]) + Math.abs(img.data[i + 2] - plain.data[i + 2]);
      }
    return d / ((x1 - x0) * img.height);
  };
  const w = withRefraction.width;
  const rim = band(withRefraction, 0, 12);
  const core = band(withRefraction, Math.round(w * 0.35), Math.round(w * 0.65));
  console.log(`rim ${rim.toFixed(2)} core ${core.toFixed(2)}`);
  check(`rim pixels change versus plain frost (${rim.toFixed(1)})`, rim > 6);
  check(`interior stays equal to plain frost (${core.toFixed(2)})`, core < rim / 4);

  // Live preference: perf-lite releases everything, removal restores.
  await page.evaluate(() => document.documentElement.classList.add('perf-lite'));
  await settle();
  check('perf-lite releases every surface live', (await refracted()).length === 0);
  check(
    'released surfaces leave no filter nodes behind',
    (await page.$$eval('[data-liquid-refraction-defs] filter', (n) => n.length)) === 0,
  );
  await page.evaluate(() => document.documentElement.classList.remove('perf-lite'));
  await settle();
  check('restored when the preference clears', (await refracted()).length === budget);

  // Dynamic content and budget hand-over.
  await page.evaluate(() => document.getElementById('p0').remove());
  await settle();
  ids = await refracted();
  check(
    'removing a surface frees budget for another',
    ids.length === budget && !ids.includes('p0'),
  );
  check('offscreen surfaces are not refracted', !(await refracted()).includes('pill'));
  // Free the budget and scroll the pill in: it is then admitted, then resized.
  await page.evaluate(() => {
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])
      document.getElementById(id).remove();
  });
  await page.evaluate(() => document.getElementById('pill').scrollIntoView({ block: 'center' }));
  await settle();
  check(
    'dispersive surface is admitted with three displacement passes',
    await page.$eval('#pill', (e) => {
      const id = getComputedStyle(e)
        .getPropertyValue('--liquid-refract-filter')
        .trim()
        .slice(5, -1);
      const f = id && document.getElementById(id);
      return (
        e.getAttribute('data-liquid-refracted') === 'dispersive' &&
        !!f &&
        f.querySelectorAll('feDisplacementMap').length === 3
      );
    }),
  );
  await page.evaluate(() => (document.getElementById('pill').style.width = '420px'));
  await settle();
  check(
    'a resized surface keeps a filter sized to its real box',
    await page.$eval('#pill', (e) => {
      const id = getComputedStyle(e)
        .getPropertyValue('--liquid-refract-filter')
        .trim()
        .slice(5, -1);
      const f = document.getElementById(id);
      return Number(f?.getAttribute('width')) === 420;
    }),
  );
  writeFileSync(join(out, 'dispersive.png'), await page.locator('#pill').screenshot());
  await page.evaluate(() => window.stopRefraction());
  check(
    'teardown removes attributes, filters and the host',
    (await refracted()).length === 0 &&
      (await page.$$('[data-liquid-refraction-defs]')).length === 0,
  );
  check('no page errors', errors.length === 0);
  console.log(`\n${checks} checks passed. Screenshots: ${out}`);
} finally {
  await browser.close();
}
