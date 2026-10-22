/** Glass slab browser contract: the REAL shader and renderer over a synthetic page, no app or database needed.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node testing/e2e/glass-slab.mjs
 *   LIQUID_BROWSER=webkit node testing/e2e/glass-slab.mjs      (needs a Playwright WebKit)
 *
 * A loud scene (text, stripes, circles) is both the page background and the snapshot texture; glass surfaces of several
 * shapes are drawn over it by `GlassRenderer`. Asserts that the shader compiles, that the interior is transparent (the
 * live DOM must show through), that the rim is opaque and genuinely differs from the unrefracted page, that the cursor
 * light moves the highlight, that a ripple changes the surface, and that with no scene only lighting is drawn. Writes a
 * labelled contact sheet to the OS temp dir for a human to look at.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const out = process.env.GLASS_OUT ?? join(tmpdir(), 'rmh-glass-slab');
mkdirSync(out, { recursive: true });

const bundle = await build({
  stdin: {
    contents: `
      import { GlassRenderer } from './lib/liquid/glass/renderer';
      const W = 900, H = 640;
      // The "page": loud, high frequency, so any bending is unmistakable.
      const page = document.getElementById('page');
      const g = page.getContext('2d');
      g.fillStyle = '#f3f5fb'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 46; i++) { g.fillStyle = i % 2 ? '#d83a4c' : '#2e62d9'; g.fillRect(i * 20, 0, 10, H); }
      g.fillStyle = 'rgba(255,255,255,.92)';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(120 + i * 150, 330 + (i % 2) * 70, 46, 0, 7); g.fill(); }
      g.fillStyle = '#10141f'; g.font = 'bold 34px system-ui';
      for (let y = 40; y < H; y += 56) g.fillText('Liquid glass bends this text ' + y, 16, y);
      const r = GlassRenderer.create();
      const state = { r, W, H, items: [] };
      window.slab = state;
      if (r) {
        r.setScene(page);
        const specs = JSON.parse(document.getElementById('specs').textContent);
        for (const s of specs) {
          const c = document.createElement('canvas');
          c.style.cssText = 'position:absolute;left:' + s.x + 'px;top:' + s.y + 'px;width:' + s.w + 'px;height:' + s.h + 'px';
          c.dataset.name = s.name;
          document.getElementById('stage').appendChild(c);
          state.items.push({ ...s, c });
        }
      }
      const ripples = () => { const a = new Float32Array(12); for (let i = 3; i < 12; i += 4) a[i - 1] = -1; return a; };
      window.draw = (name, over = {}) => {
        const it = state.items.find((i) => i.name === name);
        const rip = over.ripples ?? ripples();
        return r.draw({
          width: it.w, height: it.h, dpr: 2, radius: it.r, bezel: it.bz, thickness: it.bz * 0.85, disperse: over.disperse ?? 0.07,
          sceneX: it.x, sceneY: it.y, sceneW: W, sceneH: H, sceneOn: over.sceneOn ?? 1,
          tint: [0.96, 0.97, 1, 0.1], rim: [1, 1, 1], ink: over.ink ?? [0.05, 0.07, 0.12], dark: 0,
          lightX: over.lightX ?? -999, lightY: over.lightY ?? -999, lightZ: 90, lightOn: over.lightOn ?? 0,
          ripples: rip, press: 0,
        }, it.c);
      };
      window.ripplesAt = (x, y, age, amp = 1) => { const a = ripples(); a[0] = x; a[1] = y; a[2] = age; a[3] = amp; return a; };
      window.alphaAt = (name, x, y) => {
        const it = state.items.find((i) => i.name === name);
        const ctx = it.c.getContext('2d', { willReadFrequently: true });
        const px = Math.round(x * 2), py = Math.round(y * 2);
        return Array.from(ctx.getImageData(px, py, 1, 1).data);
      };
      window.meanAbsDiff = (name, other) => {
        const it = state.items.find((i) => i.name === name);
        const ctx = it.c.getContext('2d', { willReadFrequently: true });
        const a = ctx.getImageData(0, 0, it.c.width, it.c.height).data;
        let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - other[i]);
        return s / a.length;
      };
      window.snapshot = (name) => {
        const it = state.items.find((i) => i.name === name);
        return Array.from(it.c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, it.c.width, it.c.height).data);
      };
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});

const SPECS = [
  { name: 'card', x: 40, y: 40, w: 360, h: 200, r: 26, bz: 22 },
  { name: 'pill', x: 440, y: 60, w: 330, h: 64, r: 32, bz: 20 },
  { name: 'bar', x: 0, y: 270, w: 900, h: 56, r: 0, bz: 16 },
  { name: 'dot', x: 440, y: 150, w: 90, h: 90, r: 45, bz: 36 },
  { name: 'wide', x: 570, y: 150, w: 280, h: 100, r: 18, bz: 18 },
  { name: 'tall', x: 60, y: 350, w: 150, h: 240, r: 30, bz: 26 },
  { name: 'light', x: 250, y: 360, w: 360, h: 220, r: 28, bz: 22 },
  { name: 'ripple', x: 640, y: 360, w: 240, h: 220, r: 28, bz: 22 },
];

const slabHtml = `<style>body{margin:0}#stage{position:absolute;inset:0}#page{position:absolute;left:0;top:0}</style>
        <canvas id="page" width="900" height="640"></canvas><div id="stage"></div>
        <script type="application/json" id="specs">${JSON.stringify(SPECS)}</script>`;
// EXPORT_HTML=path writes a standalone page (markup + bundle + the page-level drawing helpers) so another driver, such
// as WebKitGTK over WebDriver, can run the very same scene; the Playwright run below is the contract.
if (process.env.EXPORT_HTML) {
  const inline = bundle.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
  writeFileSync(process.env.EXPORT_HTML, `${slabHtml}<script>${inline}</script>`);
  process.exit(0);
}

const browserName = process.env.LIQUID_BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[browserName];
assert.ok(engine, 'known browser');
const browser = await engine.launch({
  headless: true,
  ...(browserName === 'chromium'
    ? {
        executablePath: process.env.CHROMIUM_PATH,
        args: [
          '--no-sandbox',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
        ],
      }
    : {}),
});
let checks = 0;
const check = (name, value) => {
  assert.ok(value, name);
  checks++;
  console.log(`PASS ${name}`);
};
try {
  const page = await browser.newPage({
    viewport: { width: 900, height: 640 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://rmh-slab.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: slabHtml }),
  );
  await page.goto('https://rmh-slab.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  check(
    'the glass shader compiles (WebGL 2)',
    await page.evaluate(() => !!window.slab.r && window.slab.r.ready),
  );

  const drawAll = (over = {}) =>
    page.evaluate((over) => {
      for (const it of window.slab.items) window.draw(it.name, over);
    }, over);
  await drawAll();
  await page.screenshot({ path: join(out, '1-rest.png') });

  const interior = await page.evaluate(() => window.alphaAt('card', 180, 100));
  const rimPx = await page.evaluate(() => window.alphaAt('card', 180, 4));
  check(
    `interior is transparent so the live DOM shows through (alpha ${interior[3]})`,
    interior[3] < 40,
  );
  check(`the rim is painted (alpha ${rimPx[3]})`, rimPx[3] > 120);

  // The rim must differ from the unrefracted page: draw with the scene off, compare.
  const withScene = await page.evaluate(() => window.snapshot('pill'));
  await page.evaluate(() => window.draw('pill', { sceneOn: 0 }));
  const meanDiff = await page.evaluate((a) => window.meanAbsDiff('pill', a), withScene);
  check(
    `refraction genuinely changes the rim vs lighting alone (mean Δ ${meanDiff.toFixed(2)})`,
    meanDiff > 2.5,
  );

  await drawAll({ sceneOn: 0 });
  await page.screenshot({ path: join(out, '2-lit-only.png') });
  const lit = await page.evaluate(() => window.alphaAt('card', 180, 4));
  check('with no page snapshot the surface still draws light (never blank)', lit[3] > 8);

  // Cursor light: moving it changes where the glints are.
  await page.evaluate(() => window.draw('light', { lightX: 60, lightY: 40, lightOn: 1 }));
  const a = await page.evaluate(() => window.snapshot('light'));
  await page.evaluate(() => window.draw('light', { lightX: 300, lightY: 180, lightOn: 1 }));
  const dLight = await page.evaluate((a) => window.meanAbsDiff('light', a), a);
  check(`the cursor light moves the highlights (mean Δ ${dLight.toFixed(2)})`, dLight > 0.6);

  // Ripple: the surface changes while a wave crosses it and returns to rest after its life.
  const restRip = await page.evaluate(() => (window.draw('ripple'), window.snapshot('ripple')));
  await page.evaluate(() => window.draw('ripple', { ripples: window.ripplesAt(120, 110, 0.25) }));
  const dRip = await page.evaluate((a) => window.meanAbsDiff('ripple', a), restRip);
  check(`a tap ripple visibly moves the glass surface (mean Δ ${dRip.toFixed(2)})`, dRip > 0.4);
  await page.evaluate(() => window.draw('ripple', { ripples: window.ripplesAt(120, 110, 2.0) }));
  check(
    'and the surface is exactly at rest once the ripple has gone',
    (await page.evaluate((a) => window.meanAbsDiff('ripple', a), restRip)) < 0.01,
  );

  // Final contact sheet: light + a mid-flight ripple on the demo surfaces.
  await page.evaluate(() => {
    window.draw('light', { lightX: 90, lightY: 60, lightOn: 1 });
    window.draw('ripple', { ripples: window.ripplesAt(70, 100, 0.3) });
    window.draw('card', { lightX: 280, lightY: 60, lightOn: 1 });
  });
  await page.screenshot({ path: join(out, '3-light-ripple.png') });
  // A realistic backdrop: an aurora ground with content cards, the way the site actually looks behind its glass.
  await page.evaluate(() => {
    const page = document.getElementById('page');
    const g = page.getContext('2d');
    const W = 900,
      H = 640;
    g.fillStyle = '#eef1f8';
    g.fillRect(0, 0, W, H);
    const blob = (x, y, r, c) => {
      const k = g.createRadialGradient(x, y, 0, x, y, r);
      k.addColorStop(0, c);
      k.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = k;
      g.fillRect(0, 0, W, H);
    };
    blob(160, 120, 360, 'rgba(120,150,255,.75)');
    blob(760, 220, 340, 'rgba(255,140,190,.7)');
    blob(430, 520, 380, 'rgba(110,220,200,.65)');
    blob(820, 560, 260, 'rgba(255,200,120,.6)');
    const card = (x, y, w, h) => {
      g.fillStyle = 'rgba(255,255,255,.88)';
      g.beginPath();
      g.roundRect(x, y, w, h, 18);
      g.fill();
      g.fillStyle = '#1b2233';
      g.font = '600 17px system-ui';
      g.fillText('Weekly report', x + 18, y + 34);
      g.fillStyle = '#5b6478';
      g.font = '14px system-ui';
      for (let i = 0; i < 3; i++)
        g.fillText('Liquid glass refracts what sits behind its rim.', x + 18, y + 62 + i * 22);
      g.fillStyle = '#3b6cf0';
      g.fillRect(x + 18, y + h - 34, 90, 18);
    };
    card(30, 30, 380, 190);
    card(440, 50, 420, 120);
    card(30, 350, 220, 250);
    card(270, 350, 330, 230);
    card(620, 350, 260, 230);
    window.slab.r.setScene(page);
    for (const it of window.slab.items)
      window.draw(it.name, it.name === 'light' ? { lightX: 120, lightY: 70, lightOn: 1 } : {});
  });
  await page.screenshot({ path: join(out, '4-app-scene.png') });
  // The site's default identity is monochrome: black ink on a white ground. Glass must still read there.
  await page.evaluate(() => {
    const page = document.getElementById('page');
    const g = page.getContext('2d');
    const W = 900,
      H = 640;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    const blob = (x, y, r, a) => {
      const k = g.createRadialGradient(x, y, 0, x, y, r);
      k.addColorStop(0, 'rgba(0,0,0,' + a + ')');
      k.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = k;
      g.fillRect(0, 0, W, H);
    };
    blob(150, 100, 300, 0.1);
    blob(760, 220, 280, 0.09);
    blob(430, 520, 340, 0.1);
    const card = (x, y, w, h) => {
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.strokeStyle = 'rgba(0,0,0,.12)';
      g.beginPath();
      g.roundRect(x, y, w, h, 18);
      g.fill();
      g.stroke();
      g.fillStyle = '#000';
      g.font = '600 17px system-ui';
      g.fillText('Weekly report', x + 18, y + 34);
      g.fillStyle = '#565656';
      g.font = '14px system-ui';
      for (let i = 0; i < 3; i++)
        g.fillText('Liquid glass refracts what sits behind its rim.', x + 18, y + 62 + i * 22);
      g.fillStyle = '#000';
      g.fillRect(x + 18, y + h - 34, 90, 18);
    };
    card(30, 30, 380, 190);
    card(440, 50, 420, 120);
    card(30, 350, 220, 250);
    card(270, 350, 330, 230);
    card(620, 350, 260, 230);
    window.slab.r.setScene(page);
    for (const it of window.slab.items)
      window.draw(
        it.name,
        it.name === 'light'
          ? { lightX: 120, lightY: 70, lightOn: 1, ink: [0, 0, 0] }
          : { ink: [0, 0, 0] },
      );
  });
  await page.screenshot({ path: join(out, '5-mono-scene.png') });
  check('no page errors', errors.length === 0);
  console.log(`\n${checks} checks passed. Screenshots: ${out}`);
} finally {
  await browser.close();
}
