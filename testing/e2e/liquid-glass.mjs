/* global performance -- referenced only inside page.evaluate() callbacks, which run in the page. */
/** Independent material/interaction browser contract, no app or database needed.
 * CHROMIUM_PATH=/usr/bin/chromium node testing/e2e/liquid-glass.mjs
 * LIQUID_BROWSER=firefox|webkit selects installed Playwright engines.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const out = process.env.LIQUID_GLASS_OUT ?? join(tmpdir(), 'rmh-liquid-glass');
mkdirSync(out, { recursive: true });
const result = await build({
  stdin: {
    contents: `import {installLiquidInteractions} from './lib/liquid/runtime';
    import {acquireJellyGlass,resolveColor} from './components/radial/jelly-glass';
    import {RIPPLE} from './lib/fluid';
    window.stopLiquid=installLiquidInteractions();
    window.material=acquireJellyGlass();
    if(window.material) document.body.append(window.material.canvas);
    window.paint=(pinch=0)=>{
      const g=window.material;
      if(!g) return;
      g.resize(200,1);
      const style=getComputedStyle(document.documentElement);
      const bg=resolveColor(style.getPropertyValue('--site-bg').trim(),[1,1,1]);
      g.palette({ink:resolveColor(style.getPropertyValue('--site-text').trim(),[0,0,0]),accent:resolveColor(style.getPropertyValue('--site-accent').trim(),[.4,.5,1]),light:bg[0]>.5?1:0,bg:[bg[0],bg[1],bg[2]]},RIPPLE);
      g.render({ripples:new Float32Array([0,0,0,-1,0,0,0,-1,0,0,0,-1]),gx:.35,gy:.2,pinch});
    };
    window.paint();`,
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
  const advance = async (ms) => {
    await page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), ms);
    // Headless WPE can defer compositor updates until a frame is requested.
    // Sample a painted frame, rather than accepting a merely 'running' effect.
    if (browserName === 'webkit') await page.screenshot();
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const markup = `<meta name="viewport" content="width=device-width, initial-scale=1"><style>
    @layer components; :root{--site-bg:#edf1f8;--site-text:#172334;--site-accent:#5792d2;--site-surface:#f6f8fc;--site-border:#9ca8bd;--site-radius:22px;--site-radius-sm:10px;--site-shadow:0 15px 40px #15203020;--site-shadow-sm:0 3px 10px #15203012;--site-glass-light:white;--glass-blur-factor:1}
    *{box-sizing:border-box} body{margin:0;min-height:1400px;background:radial-gradient(ellipse at 50% 20%,#89a8e3,transparent 65%),#edf1f8;font:16px system-ui;color:var(--site-text)}
    article{position:absolute;width:260px;height:190px;padding:24px} #left{left:40px;top:70px}#right{left:510px;top:70px}
    #off{left:40px;top:330px}#far{left:720px;top:500px;width:200px} button{padding:12px}canvas{position:absolute;left:390px;top:380px;width:200px;height:200px}
    ${materialCss}</style>
    <article id="left" class="glass-fill"><h2>Clear content</h2><button>Activate</button><input aria-label="Message"></article>
    <article id="right" class="glass-pane"><h2>Liquid pane</h2><p>Live, selectable HTML.</p></article>
    <article id="off" class="glass-pane" data-liquid-motion="off">Motion opted out</article>
    <article id="far" class="glass-overlay">Overlay clarity</article>`;
  await page.route('https://rmh-glass.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: markup }),
  );
  await page.goto('https://rmh-glass.test/');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  const stationary = async (label, action, selectors = ['#left', '#right', '#off', '#far']) => {
    await page.evaluate((selectors) => {
      const elements = selectors.map((s) => document.querySelector(s));
      const original = elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, transform: getComputedStyle(el).transform };
      });
      window.stillness = { peak: 0, frames: 0, transformsKept: true, raf: 0 };
      const sample = () => {
        const probe = window.stillness;
        probe.frames++;
        elements.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          probe.peak = Math.max(probe.peak, Math.hypot(r.x - original[i].x, r.y - original[i].y));
          probe.transformsKept &&= getComputedStyle(el).transform === original[i].transform;
        });
        probe.raf = window.requestAnimationFrame(sample);
      };
      sample();
    }, selectors);
    await action();
    await advance(600);
    const probe = await page.evaluate(() => {
      window.cancelAnimationFrame(window.stillness.raf);
      return window.stillness;
    });
    check(label, probe.frames > 1 && probe.peak < 0.01 && probe.transformsKept);
  };
  await stationary('an off-target click never moves neighbouring surfaces', () =>
    page.mouse.click(405, 160),
  );
  await stationary('rapid clicks never shake surrounding content', async () => {
    for (let i = 0; i < 6; i++) {
      await page.mouse.click(405, 160);
      await advance(35);
    }
  });
  await page.mouse.move(160, 130);
  await advance(40);
  check(
    'one decorative cursor light is composited',
    (await page.locator('.liquid-light').count()) === 1,
  );
  check(
    'light is noninteractive and hidden from accessibility tree',
    await page
      .locator('.liquid-light')
      .evaluate(
        (el) =>
          getComputedStyle(el).pointerEvents === 'none' &&
          el.getAttribute('aria-hidden') === 'true',
      ),
  );
  await page.evaluate(() => document.documentElement.classList.add('reduce-motion'));
  await advance(40);
  check(
    'live account preference removes cursor light',
    (await page.locator('.liquid-light').count()) === 0,
  );
  await page.mouse.click(405, 160);
  await advance(150);
  check(
    'reduced motion keeps surfaces stationary',
    await page.locator('#left').evaluate((el) => getComputedStyle(el).transform === 'none'),
  );
  await page.evaluate(() => document.documentElement.classList.remove('reduce-motion'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(160, 130);
  await advance(40);
  check('OS reduced motion prevents lighting', (await page.locator('.liquid-light').count()) === 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('input').fill('Text entry is intact');
  check(
    'fields remain editable without moving surrounding content',
    (await page.locator('input').inputValue()) === 'Text entry is intact' &&
      (await page.locator('#right').evaluate((el) => getComputedStyle(el).transform === 'none')),
  );
  await page.evaluate(() => {
    window.activations = 0;
    document.querySelector('button').onclick = () => window.activations++;
  });
  await page.locator('button').click();
  check(
    'normal button activation fires exactly once',
    await page.evaluate(() => window.activations === 1),
  );
  await page.evaluate(() => {
    const el = document.createElement('article');
    el.id = 'dynamic';
    el.className = 'glass-fill';
    el.style.cssText = 'left:510px;top:300px;transform:rotate(8deg);will-change:opacity';
    document.body.append(el);
  });
  await stationary(
    'new surfaces keep their own transforms during clicks',
    () => page.mouse.click(430, 345),
    ['#left', '#right', '#dynamic'],
  );
  check(
    'component transforms and layer hints are preserved',
    await page
      .locator('#dynamic')
      .evaluate(
        (el) =>
          el.style.transform === 'rotate(8deg)' &&
          el.style.willChange === 'opacity' &&
          el.getAnimations().length === 0,
      ),
  );
  await page.locator('#dynamic').hover();
  await advance(40);
  check(
    'new surfaces still receive fallback cursor lighting',
    (await page.locator('#dynamic .liquid-light').count()) === 1,
  );
  await page.locator('#dynamic').evaluate((el) => el.remove());
  await advance(40);
  check(
    'unmount removes the detached cursor light',
    (await page.locator('.liquid-light').count()) === 0,
  );
  await stationary('dragging does not move nearby surfaces', async () => {
    await page.mouse.move(400, 160);
    await page.mouse.down();
    await page.mouse.move(440, 190);
    await page.mouse.up();
  });
  check('shared globe dielectric shader compiles', await page.evaluate(() => !!window.material));
  const before = await page.locator('canvas').screenshot();
  await page.evaluate(() => window.paint(0.16));
  const after = await page.locator('canvas').screenshot();
  check('finger contact changes the dielectric highlight', !before.equals(after));
  await page.screenshot({ path: join(out, `${browserName}-light.png`) });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--site-bg', '#141c29');
    document.documentElement.style.setProperty('--site-text', '#eef4ff');
    window.paint(0.16);
  });
  await page.screenshot({ path: join(out, `${browserName}-dark.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(out, `${browserName}-phone.png`) });
  await page.evaluate(() => {
    window.stopLiquid();
    window.material?.canvas.remove();
  });
  check('cleanup removes decorated layers', (await page.locator('.liquid-light').count()) === 0);
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: browserName !== 'firefox',
  });
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.route('https://rmh-glass.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: markup }),
  );
  await phone.goto('https://rmh-glass.test/');
  await phone.addScriptTag({ content: result.outputFiles[0].text });
  await phone.touchscreen.tap(345, 160);
  // Sample the whole response window so even a brief click-induced shake fails.
  const peak = await phone.locator('#left').evaluate(
    (el) =>
      new Promise((resolve) => {
        let best = 0;
        const t0 = performance.now();
        const tick = () => {
          const m = new window.DOMMatrix(getComputedStyle(el).transform);
          best = Math.max(best, Math.hypot(m.m41, m.m42));
          if (performance.now() - t0 < 500) setTimeout(tick, 16);
          else resolve(best);
        };
        tick();
      }),
  );
  await phone.screenshot({ path: join(out, `${browserName}-touch.png`) });
  check('touch taps never move neighbouring surfaces', peak === 0);
  check('touch creates no cursor light', (await phone.locator('.liquid-light').count()) === 0);
  await phone.evaluate(() => document.dispatchEvent(new window.Event('pointercancel')));
  await phone.waitForTimeout(500);
  await phone.screenshot();
  check(
    'cancelled touch returns to rest',
    await phone
      .locator('#left')
      .evaluate(
        (el) => getComputedStyle(el).transform === 'none' && el.getAnimations().length === 0,
      ),
  );
  await phone.evaluate(() => document.documentElement.classList.add('reduce-transparency'));
  await phone.touchscreen.tap(345, 160);
  await phone.waitForTimeout(160);
  check(
    'reduced transparency suppresses touch decoration',
    await phone
      .locator('#left')
      .evaluate(
        (el) => getComputedStyle(el).transform === 'none' && el.getAnimations().length === 0,
      ),
  );
  await phone.evaluate(() => {
    window.stopLiquid();
    window.material?.canvas.remove();
  });
  await phone.close();
  check('no browser runtime errors', errors.length === 0);
  console.log(`${checks} checks passed on ${browserName}; screenshots: ${out}`);
} finally {
  await browser.close();
}
