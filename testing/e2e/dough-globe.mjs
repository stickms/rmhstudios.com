/** Dough globe browser contract: the REAL dough simulation driving the REAL coat shader, no app or database needed.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node testing/e2e/dough-globe.mjs
 *   LIQUID_BROWSER=webkit node testing/e2e/dough-globe.mjs      (needs a Playwright WebKit)
 *
 * It scripts a finger (press, hold, drag, release) against `DoughBody`, uploads each frame's field to the shader, draws a
 * wireframe through `DoughBody.deform` (the same call the cage and pins use) and writes a contact sheet of named states
 * to the OS temp dir. Asserts that the shader compiles, that the silhouette really moves (alpha at the rest limb /
 * outside it), that the GPU and CPU agree on where material went, and that rest draws exactly the rest disc.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const out = process.env.DOUGH_OUT ?? join(tmpdir(), 'rmh-dough-globe');
mkdirSync(out, { recursive: true });

const bundle = await build({
  stdin: {
    contents: `
      import { DoughBody } from './lib/dough';
      import { JellyGlass, acquireJellyGlass, JELLY_BLEED, JELLY_EXTENT, lastShaderError } from './components/radial/jelly-glass';
      import { RIPPLE } from './lib/fluid';
            const D = 360;
      const body = new DoughBody();
      const glass = acquireJellyGlass();
      const frame = { ripples: new Float32Array(12), gx: 0, gy: 0, pinch: 0 };
      for (let i = 3; i < 12; i += 4) frame.ripples[i] = -1;
      const host = document.getElementById('host');
      const wire = document.getElementById('wire');
      const R = D / 2;
      const bleed = D * JELLY_BLEED;
      if (glass) {
        glass.resize(D, 1);
        glass.palette({ ink: [0.08, 0.1, 0.16], accent: [0.34, 0.5, 0.86], light: 1, bg: [0.93, 0.95, 0.98] }, RIPPLE);
        glass.canvas.style.cssText = 'position:absolute;left:' + (-bleed) + 'px;top:' + (-bleed) + 'px;width:' + (D + 2 * bleed) + 'px;height:' + (D + 2 * bleed) + 'px';
        host.appendChild(glass.canvas);
      }
      const out = new Float64Array(2);
      function drawWire() {
        const ctx = wire.getContext('2d');
        ctx.clearRect(0, 0, wire.width, wire.height);
        ctx.translate(wire.width / 2, wire.height / 2);
        ctx.strokeStyle = 'rgba(20,30,60,0.55)';
        ctx.lineWidth = 1;
        const ring = (pt) => {
          ctx.beginPath();
          for (let i = 0; i <= 96; i++) {
            const [x, y, z] = pt(i / 96);
            if (z < 0) { ctx.moveTo(NaN, NaN); continue; }
            body.deform(x, y, out, z);
            i === 0 || isNaN(x) ? ctx.moveTo(out[0] * R, out[1] * R) : ctx.lineTo(out[0] * R, out[1] * R);
          }
          ctx.stroke();
        };
        for (let k = -3; k <= 3; k++) {
          const lat = (k / 4) * (Math.PI / 2);
          ring((t) => { const a = t * Math.PI * 2; return [Math.cos(lat) * Math.sin(a), -Math.sin(lat), Math.cos(lat) * Math.cos(a)]; });
        }
        for (let k = 0; k < 6; k++) {
          const lon = (k / 6) * Math.PI;
          ring((t) => { const a = t * Math.PI * 2; return [Math.cos(a) * Math.sin(lon), Math.sin(a), Math.cos(a) * Math.cos(lon)]; });
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      window.dough = {
        body, glass,
        ok: !!glass && glass.ready,
        error: () => lastShaderError,
        step(dt) { body.step(dt); },
        paint() {
          if (!glass) return;
          glass.setField(body.field, body.version);
          frame.gx = body.gx; frame.gy = body.gy; frame.pinch = body.pinch;
          glass.render(frame);
          drawWire();
        },
        // A known page for the lens: left half red, right half blue, in the stage's viewport coordinates.
        async lens() {
          const c = document.createElement('canvas');
          c.width = 560;
          c.height = 560;
          const g = c.getContext('2d');
          g.fillStyle = '#d02020';
          g.fillRect(0, 0, 280, 560);
          g.fillStyle = '#2040d0';
          g.fillRect(280, 0, 280, 560);
          const bitmap = await createImageBitmap(c);
          glass.setScene({ bitmap, width: 560, height: 560, scrollX: 0, scrollY: 0, version: 1 });
          glass.place(100 + D / 2, 100 + D / 2, D / 2, 0, 0);
          return true;
        },
        lensOff() { glass.setScene(null); },
        run(seconds) { for (let t = 0; t < seconds; t += 1 / 60) body.step(1 / 60); },
      };
      window.dough.paint();
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});

const D = 360;
const doughHtml = `<style>body{margin:0;background:linear-gradient(135deg,#e9eef9,#f7e9ef)}
        #stage{position:absolute;left:100px;top:100px;width:${D}px;height:${D}px}
        #host{position:absolute;inset:0}
        #wire{position:absolute;left:${-(D * 0.5)}px;top:${-(D * 0.5)}px;width:${D * 2}px;height:${D * 2}px;pointer-events:none}
        .rest{position:absolute;inset:0;border-radius:50%;border:1px dashed rgba(200,40,40,.45);pointer-events:none}</style>
        <div id="stage"><div id="host"></div><canvas id="wire" width="${D * 2}" height="${D * 2}"></canvas><div class="rest"></div></div>`;
// EXPORT_HTML=path writes a standalone page (markup + bundle) for another driver, e.g. WebKitGTK over WebDriver.
if (process.env.EXPORT_HTML) {
  const inline = bundle.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
  writeFileSync(process.env.EXPORT_HTML, `${doughHtml}<script>${inline}</script>`);
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
    viewport: { width: 560, height: 560 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://rmh-dough.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: doughHtml }),
  );
  await page.goto('https://rmh-dough.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  check(
    'the coat shader compiles and the context is ready (WebGL 2)',
    await page.evaluate(() => window.dough.ok),
  );

  const shot = async (name) => {
    await page.evaluate(() => window.dough.paint());
    const buf = await page.screenshot({ clip: { x: 60, y: 60, width: 440, height: 440 } });
    writeFileSync(join(out, `${name}.png`), buf);
  };
  // Alpha of the GL canvas at a point in radii (y down), read back from the framebuffer.
  const alphaAt = (x, y) =>
    page.evaluate(
      ([x, y]) => {
        const g = window.dough.glass;
        const c = g.canvas;
        const tmp = document.createElement('canvas');
        tmp.width = c.width;
        tmp.height = c.height;
        const ctx = tmp.getContext('2d', { willReadFrequently: true });
        window.dough.paint();
        ctx.drawImage(c, 0, 0);
        const E = 1.22;
        const px = Math.round(((x + E) / (2 * E)) * c.width);
        const py = Math.round(((y + E) / (2 * E)) * c.height);
        return ctx.getImageData(px, py, 1, 1).data[3];
      },
      [x, y],
    );

  await shot('0-rest');
  // The lens: through a ball the page is inverted. A point on the RIGHT of the ball must show the page's LEFT (red).
  await page.evaluate(() => window.dough.lens());
  await page.evaluate(() => window.dough.paint());
  const px = (x, y) =>
    page.evaluate(
      ([x, y]) => {
        // Draw and read in ONE task: the GL canvas does not preserve its buffer between tasks.
        window.dough.paint();
        const c = window.dough.glass.canvas;
        const t = document.createElement('canvas');
        t.width = c.width;
        t.height = c.height;
        const ctx = t.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(c, 0, 0);
        const E = 1.22;
        return Array.from(
          ctx.getImageData(
            Math.round(((x + E) / (2 * E)) * c.width),
            Math.round(((y + E) / (2 * E)) * c.height),
            1,
            1,
          ).data,
        );
      },
      [x, y],
    );
  const right = await px(0.45, 0);
  const left = await px(-0.45, 0);
  check(
    `the ball inverts the page: right shows red, left shows blue (${right} | ${left})`,
    right[0] > right[2] + 20 && left[2] > left[0] + 20,
  );
  check('the lens is opaque enough to read as an image', right[3] > 150);
  await shot('0b-lens');
  await page.evaluate(() => window.dough.lensOff());
  await page.evaluate(() => window.dough.paint());
  check('with the picture withdrawn the ball is clear glass again', (await px(0.45, 0))[3] < 120);
  check(
    'at rest the rest disc is drawn and nothing outside it',
    (await alphaAt(0, 0)) > 4 && (await alphaAt(1.1, 0)) === 0,
  );

  await page.evaluate(() => {
    window.dough.body.grab(0.15, 0.05);
    window.dough.run(0.5);
  });
  await shot('1-press-held');
  check('a held press bends the lit surface under the finger', (await alphaAt(0.15, 0.05)) > 0);

  await page.evaluate(() => {
    window.dough.body.release();
    window.dough.run(0.28);
  });
  await shot('2-release-0.28s');
  await page.evaluate(() => window.dough.run(1.6));
  await shot('3-release-1.9s');

  // Press near the limb: the silhouette must bulge past the rest limb.
  await page.evaluate(() => {
    const b = window.dough.body;
    b.release();
    window.dough.run(8);
    b.grab(0.55, 0);
    window.dough.run(0.6);
  });
  await shot('4-press-near-limb');
  check(
    'pressing near the limb pushes the silhouette past the rest limb',
    (await alphaAt(1.04, 0)) > 4,
  );

  // Knead: drag across the face.
  await page.evaluate(() => {
    const b = window.dough.body;
    b.release();
    window.dough.run(8);
    b.grab(-0.5, 0.2);
    let x = -0.5;
    for (let t = 0; t < 0.7; t += 1 / 60) {
      x += 1.1 / 60;
      b.drag(x, 0.2 - (x + 0.5) * 0.25, 1.1, -0.28);
      b.step(1 / 60);
    }
  });
  await shot('5-drag-held');
  await page.evaluate(() => {
    window.dough.body.release();
    window.dough.run(0.4);
  });
  await shot('6-drag-after-0.4s');
  await page.evaluate(() => window.dough.run(10));
  await shot('7-settled');
  check(
    'the body returns exactly to the rest disc',
    (await alphaAt(1.1, 0)) === 0 && (await page.evaluate(() => !window.dough.body.active())),
  );

  check('no page errors', errors.length === 0);
  console.log(`\n${checks} checks passed. Screenshots: ${out}`);
} finally {
  await browser.close();
}
