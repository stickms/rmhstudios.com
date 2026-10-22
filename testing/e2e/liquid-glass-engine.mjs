/* global CanvasRenderingContext2D -- referenced only inside page.addInitScript() callbacks, which run in the page. */
/** Glass engine browser contract: the REAL engine, REAL page capture, REAL stylesheet, on a self-contained page. No app, no
 * database.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node testing/e2e/liquid-glass-engine.mjs
 *   LIQUID_BROWSER=firefox|webkit node testing/e2e/liquid-glass-engine.mjs
 *
 * It asserts what the design promises: which surfaces become glass (and which never do), that the canvas sits BEHIND the
 * content and takes no input, that the interior stays transparent (the live DOM shows through), that floating glass
 * refracts the page once a snapshot lands, that the cursor light and tap ripples move the surface and then settle, that
 * nothing draws at rest, that preferences remove every canvas live, that dynamic content joins and leaves cleanly, that
 * no surface uses `backdrop-filter` (the one thing that differs per engine), and that teardown leaves no trace.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const out = process.env.LIQUID_GLASS_OUT ?? join(tmpdir(), 'rmh-liquid-glass-engine');
mkdirSync(out, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import { installLiquidGlass } from './lib/liquid/glass/engine';
      import { GlassRenderer } from './lib/liquid/glass/renderer';
      window.glassPoses = {};
      const draw = GlassRenderer.prototype.draw;
      GlassRenderer.prototype.draw = function(o, canvas) {
        window.glassPoses[canvas.parentElement.id] = o.tilt;
        return draw.call(this, o, canvas);
      };
      window.stopGlass = installLiquidGlass();`,
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
const browser = await engine.launch({
  headless: true,
  ...(browserName === 'firefox' && process.env.FIREFOX_PATH
    ? { executablePath: process.env.FIREFOX_PATH }
    : {}),
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const rows = Array.from(
    { length: 40 },
    (_, i) =>
      `<p style="margin:0 0 14px;font:600 20px system-ui">Row ${i} — liquid glass bends what scrolls under it.</p>`,
  ).join('');
  const markup = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    @layer components; :root{--site-bg:#f1f4fa;--site-text:#10151f;--site-accent:#4a82d8;--site-surface:#f7f9fd;--site-border:#9aa6bb;--site-radius:22px;--site-radius-sm:10px;--site-shadow:0 15px 40px #15203020;--site-shadow-sm:0 3px 10px #15203012;--site-glass-light:white;--glass-blur-factor:1}
    *{box-sizing:border-box} body{margin:0;min-height:2400px;color:var(--site-text);font:16px system-ui;
      background:repeating-linear-gradient(90deg,#d8e1f5 0 16px,#f1f4fa 16px 32px)}
    header{position:sticky;top:0;height:56px;padding:12px 24px;z-index:10}
    main{padding:24px 40px}
    #pane{width:360px;height:180px;padding:28px;margin:24px 0}
    #overlay{position:fixed;right:40px;top:120px;width:240px;height:120px;padding:24px;z-index:20}
    #fill{width:300px;height:120px;padding:24px;margin:24px 0}
    #off{width:300px;height:100px;padding:24px;margin:24px 0}
    #aside{width:200px;height:100px;padding:24px;margin:24px 0}
    #tiny{width:12px;height:12px}
    ${materialCss}</style>
    <header class="glass-chrome" id="chrome"><b>Chrome</b> <button id="btn">Press</button></header>
    <main>
      <section class="glass-pane" id="pane"><h2 style="margin:0">Pane</h2><input id="field" aria-label="Message"></section>
      <section class="glass-fill" id="fill">Fill: a repeated card, drawn last</section>
      <section class="glass-pane" id="off" data-liquid-material="off">Opted out</section>
      <section class="glass-chrome glass-chrome--aside" id="aside">Opaque aside</section>
      <div class="glass-pane" id="tiny"></div>
      ${rows}
    </main>
    <aside class="glass-overlay" id="overlay">Overlay</aside>`;
  await page.route('https://rmh-glass-engine.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: markup }),
  );
  await page.addInitScript(() => {
    window.__draws = 0;
    const d = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...a) {
      if (this.canvas?.hasAttribute?.('data-liquid-glass')) window.__draws++;
      return d.apply(this, a);
    };
  });
  await page.goto('https://rmh-glass-engine.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const settle = (ms = 250) => page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);
  // Wait for the engine's first admission pass rather than a fixed delay: under software GL on a loaded machine 600 ms
  // was sometimes not enough, and the first assertion below then failed for timing, not behaviour.
  await page
    .waitForSelector('#pane[data-liquid-canvas="on"]', { timeout: 15000 })
    .catch(() => undefined);
  await settle(600);

  // ── Which surfaces become glass ──
  const has = (sel) => page.$eval(sel, (e) => e.getAttribute('data-liquid-canvas') === 'on');
  check('a visible glass-pane gets a canvas', await has('#pane'));
  check('sticky glass-chrome gets a canvas', await has('#chrome'));
  check('a fixed glass-overlay gets a canvas', await has('#overlay'));
  check('glass-fill (a repeated card) gets a lit canvas', await has('#fill'));
  check('data-liquid-material="off" never does', !(await has('#off')));
  check('the opaque aside never does', !(await has('#aside')));
  check('a surface too small for a bevel never does', !(await has('#tiny')));
  const count = await page.$$eval('canvas[data-liquid-glass]', (n) => n.length);
  check(`exactly the four eligible surfaces are drawn (${count})`, count === 4);

  // ── Behind the content, taking no input ──
  const stack = await page.$eval('#pane', (host) => {
    const c = host.querySelector('canvas[data-liquid-glass]');
    const cs = getComputedStyle(c);
    return {
      last: host.lastElementChild === c,
      z: cs.zIndex,
      pe: cs.pointerEvents,
      iso: getComputedStyle(host).isolation,
      aria: c.getAttribute('aria-hidden'),
    };
  });
  check(
    "the canvas is the host's last child, z-index -2 (under the eversion hover layer at -1), inert and hidden from assistive tech",
    stack.last && stack.z === '-2' && stack.pe === 'none' && stack.aria === 'true',
  );
  check(
    'the host isolates its stacking context so the negative z-index stays inside it',
    stack.iso === 'isolate',
  );
  const hit = await page.evaluate(() => {
    const r = document.querySelector('#field').getBoundingClientRect();
    return document.elementFromPoint(r.left + 8, r.top + 8)?.id;
  });
  check('input inside a glass pane is still what a click lands on', hit === 'field');
  await page.fill('#field', 'typing works');
  check('text entry works through the glass', (await page.inputValue('#field')) === 'typing works');

  // ── The same material in every engine: no backdrop-filter, anywhere ──
  const blur = await page.$$eval('.glass-pane,.glass-chrome,.glass-overlay,.glass-fill', (n) =>
    n.map(
      (e) =>
        getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter || 'none',
    ),
  );
  check(
    'no glass role uses backdrop-filter (the one engine-specific primitive)',
    blur.every((b) => b === 'none'),
  );

  // ── Interior transparent, rim painted ──
  const alphaAt = (sel, fx, fy) =>
    page.$eval(
      sel + ' canvas[data-liquid-glass]',
      (c, [fx, fy]) => {
        const t = document.createElement('canvas');
        t.width = c.width;
        t.height = c.height;
        const ctx = t.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(c, 0, 0);
        return ctx.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data[3];
      },
      [fx, fy],
    );
  check(
    'the interior is transparent: the live DOM shows through',
    (await alphaAt('#pane', 0.5, 0.5)) < 40,
  );
  check('the bevel is painted', (await alphaAt('#pane', 0.5, 0.97)) > 6);

  // ── Floating glass refracts the page once a snapshot lands ──
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-liquid-scene') === 'on',
    null,
    { timeout: 25000 },
  );
  check('a page snapshot is captured and shared', true);
  await settle(500);
  const snap = (sel) =>
    page.$eval(sel + ' canvas[data-liquid-glass]', (c) => {
      const t = document.createElement('canvas');
      t.width = c.width;
      t.height = c.height;
      const ctx = t.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(c, 0, 0);
      return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
    });
  const diff = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  };
  // Without a picture the rim is only light (mostly transparent); an OPAQUE rim is the refracted page.
  check('floating glass has an opaque, refracted rim', (await alphaAt('#chrome', 0.5, 0.96)) > 200);
  check(
    'content glass never refracts a stale duplicate of its own text or hover',
    (await alphaAt('#fill', 0.5, 0.96)) < 200 && (await alphaAt('#pane', 0.5, 0.96)) < 200,
  );

  // ── Cursor light and ripples move the surface, then it settles ──
  const box = await (await page.$('#pane')).boundingBox();
  await page.mouse.move(box.x + box.width + 400, box.y - 200);
  await settle(450);
  const far = await snap('#pane');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await settle(450);
  const near = await snap('#pane');
  check(
    `the cursor is a light: the glass changes as it arrives (Δ ${diff(far, near).toFixed(2)})`,
    diff(far, near) > 0.3,
  );
  await page.mouse.move(box.x + box.width + 400, box.y - 200, { steps: 5 });
  await settle(700);
  const gone = await snap('#pane');
  check('and returns to rest when it leaves', diff(far, gone) < 0.5);
  await page.mouse.move(box.x + box.width + 120, box.y + 30);
  await page.mouse.down();
  await settle(220);
  const rippling = await snap('#pane');
  await page.mouse.up();
  // Move the cursor away too, so the only thing that could still be changing the surface is the ripple.
  await page.mouse.move(box.x + box.width + 400, box.y - 200, { steps: 4 });
  await settle(1700);
  const calm = await snap('#pane');
  check(
    `a tap beside the pane ripples its surface (Δ ${diff(gone, rippling).toFixed(2)})`,
    diff(gone, rippling) > 0.15,
  );
  check('and the ripple has fully gone by its lifetime', diff(gone, calm) < 0.8);

  // Optical tilt follows the cursor; the card's hit area and text never move.
  const origin = await page.locator('#pane').boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await settle(550);
  const leftTilt = await page.evaluate(() => window.glassPoses.pane);
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await settle(550);
  const rightTilt = await page.evaluate(() => window.glassPoses.pane);
  check(
    'the glass tilts gently toward the cursor on both axes',
    leftTilt[0] < -0.5 &&
      leftTilt[1] < -0.5 &&
      rightTilt[0] > 0.5 &&
      rightTilt[1] > 0.5 &&
      Math.hypot(...leftTilt) <= 1.001 &&
      Math.hypot(...rightTilt) <= 1.001,
  );
  const held = await page.locator('#pane').boundingBox();
  check(
    'optical tilt leaves the live DOM geometry unchanged',
    origin.x === held.x &&
      origin.y === held.y &&
      origin.width === held.width &&
      origin.height === held.height,
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle(650);
  check(
    'reduced motion returns the glass to a neutral optical pose',
    (await page.evaluate(() => window.glassPoses.pane)).every((v) => v === 0),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ── Nothing runs at rest ──
  await page.mouse.move(5, 5);
  await settle(1800);
  const before = await page.evaluate(() => window.__draws);
  await settle(2200);
  check('at rest the engine draws nothing', (await page.evaluate(() => window.__draws)) === before);

  // ── Scroll: invalidate stale refraction once, then let the DOM own motion ──
  const draws0 = await page.evaluate(() => window.__draws);
  await page.evaluate(() => window.scrollTo(0, 220));
  await settle(300);
  check(
    'scrolling redraws the sticky header to clear its stale snapshot',
    (await page.evaluate(() => window.__draws)) > draws0,
  );
  const during = await page.evaluate(async () => {
    // Longer than the capture debounce: the old throttle captured mid-gesture.
    for (let i = 0; i < 24; i++) {
      window.scrollTo(0, 220 + i * 8);
      await new Promise((r) => setTimeout(r, 40));
    }
    return document.documentElement.hasAttribute('data-liquid-scene');
  });
  check('continuous scrolling never displays a stale page capture', !during);
  check(
    'the header retains its lit bevel while scrolling',
    (await alphaAt('#chrome', 0.5, 0.96)) < 200,
  );
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-liquid-scene') === 'on',
    null,
    { timeout: 25000 },
  );
  check('fresh refraction returns after scrolling settles', true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(300);

  // ── Preferences remove every canvas, live ──
  await page.evaluate(() => document.documentElement.classList.add('perf-lite'));
  await settle(250);
  check(
    'perf-lite removes every canvas',
    (await page.$$('canvas[data-liquid-glass]')).length === 0 && !(await has('#pane')),
  );
  await page.evaluate(() => document.documentElement.classList.remove('perf-lite'));
  await settle(400);
  check(
    'and clearing it brings them back',
    (await page.$$('canvas[data-liquid-glass]')).length === 4,
  );
  await page.emulateMedia({ forcedColors: 'active' });
  await settle(300);
  check(
    'forced colours removes every canvas',
    (await page.$$('canvas[data-liquid-glass]')).length === 0,
  );
  await page.emulateMedia({ forcedColors: 'none' });
  await settle(400);

  // ── Dynamic content joins and leaves ──
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'late';
    el.className = 'glass-pane';
    el.style.cssText = 'width:200px;height:90px;margin:20px 0';
    document.querySelector('main').prepend(el);
  });
  await settle(400);
  check('a surface added later joins', await has('#late'));
  await page.evaluate(() => document.querySelector('#late').remove());
  await settle(300);
  check(
    'and one removed leaves no canvas behind',
    (await page.$$('canvas[data-liquid-glass]')).length === 4,
  );

  await page.screenshot({ path: join(out, `${browserName}-engine.png`) });

  // ── Teardown ──
  await page.evaluate(() => window.stopGlass());
  await settle(200);
  check(
    'teardown removes every canvas, attribute and the snapshot flag',
    (await page.$$('canvas[data-liquid-glass]')).length === 0 &&
      (await page.$$('[data-liquid-canvas]')).length === 0 &&
      (await page.evaluate(() => !document.documentElement.hasAttribute('data-liquid-scene'))),
  );
  if (errors.length) console.log(errors.slice(0, 4));
  check('no page errors', errors.length === 0);
  console.log(`\n${checks} checks passed on ${browserName}; screenshots: ${out}`);
} finally {
  await browser.close();
}
