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
      g.palette({ink:resolveColor(style.getPropertyValue('--site-text').trim(),[0,0,0]),accent:resolveColor(style.getPropertyValue('--site-accent').trim(),[.4,.5,1]),light:bg[0]>.5?1:0},RIPPLE);
      g.render({ripples:new Float32Array([0,0,0,-1,0,0,0,-1,0,0,0,-1]),gx:.35,gy:.2,dx:0,dy:0,pinch});
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
  await page.evaluate(() => {
    window.poseJumps = [];
    document.addEventListener(
      'pointerdown',
      () => {
        if (!window.measureRetarget) return;
        // Read the native timeline phase in this same event. WPE's computed
        // style may still describe the last presented frame between paints.
        const effect = document.querySelector('#left').getAnimations()[0];
        if (!effect) {
          window.poseBefore = [0, 0];
          return;
        }
        const frames = effect.effect.getKeyframes();
        const phase = Math.min(
          1,
          Math.max(0, Number(effect.currentTime) / effect.effect.getComputedTiming().duration),
        );
        const index = Math.min(frames.length - 2, Math.floor(phase * (frames.length - 1)));
        const first = frames[index],
          last = frames[index + 1];
        const t = (phase - first.computedOffset) / (last.computedOffset - first.computedOffset);
        const a = new window.DOMMatrix(first.transform),
          b = new window.DOMMatrix(last.transform);
        window.poseBefore = [a.m41 + (b.m41 - a.m41) * t, a.m42 + (b.m42 - a.m42) * t];
      },
      true,
    );
  });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.evaluate(() => {
    document.addEventListener(
      'pointerdown',
      () => {
        if (!window.measureRetarget) return;
        const animation = document.querySelector('#left').getAnimations()[0];
        const m = new window.DOMMatrix(animation.effect.getKeyframes()[0].transform);
        window.poseJumps.push(
          Math.hypot(m.m41 - window.poseBefore[0], m.m42 - window.poseBefore[1]),
        );
      },
      true,
    );
  });
  await advance(100); // let the shared visibility observer deliver
  await page.mouse.click(405, 160);
  await advance(160);
  const moved = await page.waitForFunction(
    () => {
      const matrix = new window.DOMMatrix(
        getComputedStyle(document.querySelector('#left')).transform,
      );
      return Math.hypot(matrix.m41, matrix.m42) > 0.01;
    },
    null,
    { timeout: 5000 },
  );
  const displaced = await moved.jsonValue();
  check('off-target tap displaces a neighbouring surface', displaced);
  check(
    'opt-out subtree stays still',
    await page.locator('#off').evaluate((el) => getComputedStyle(el).transform === 'none'),
  );
  check(
    'far surface receives no impulse outside radius',
    await page.locator('#far').evaluate((el) => getComputedStyle(el).transform === 'none'),
  );
  await advance(1800);
  await page.waitForFunction(() => !document.querySelector('#left').getAnimations().length, null, {
    timeout: 8000,
  });
  check(
    'settling restores inline styles and releases layers',
    await page
      .locator('#left')
      .evaluate(
        (el) =>
          getComputedStyle(el).transform === 'none' && !el.style.rotate && !el.style.willChange,
      ),
  );
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
    'reduced motion prevents waves',
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
    'fields remain editable and do not launch waves',
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
  await advance(80);
  await page.mouse.click(430, 345);
  await advance(160);
  check(
    'newly mounted surfaces join the field',
    await page.locator('#dynamic').evaluate((el) => {
      const m = new window.DOMMatrix(getComputedStyle(el).transform);
      return (
        el.getAnimations().length > 0 &&
        Math.abs(m.m41) > 0.01 &&
        Math.abs(m.m11 - Math.cos((8 * Math.PI) / 180)) < 0.003
      );
    }),
  );
  await advance(1900);
  check(
    'component transforms and layer hints are preserved',
    await page
      .locator('#dynamic')
      .evaluate((el) => el.style.transform === 'rotate(8deg)' && el.style.willChange === 'opacity'),
  );
  await page.mouse.click(430, 345);
  await page.evaluate(() => {
    const el = document.querySelector('#dynamic');
    window.detachedEffects = el.getAnimations();
    el.remove();
  });
  await advance(40);
  check(
    'unmount cancels the detached surface effect',
    await page.evaluate(
      () =>
        window.detachedEffects.length > 0 &&
        window.detachedEffects.every((a) => a.playState === 'idle'),
    ),
  );
  await page.mouse.move(400, 160);
  await page.mouse.down();
  await page.mouse.move(440, 190);
  await advance(450);
  check(
    'dragging recovers smoothly to rest',
    await page.locator('#left').evaluate((el) => getComputedStyle(el).transform === 'none'),
  );
  await page.mouse.up();
  await page.mouse.click(405, 160);
  await advance(120);
  await page.evaluate(() => {
    window.measureRetarget = true;
  });
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(405, 160);
    await advance(35);
  }
  const worstJump = await page.evaluate(() => {
    window.measureRetarget = false;
    return Math.max(...window.poseJumps);
  });
  check('rapid retarget starts at the previous native animation pose', worstJump < 0.15);
  await advance(2200);
  check(
    'overlapping impacts finish at the original pose',
    await page
      .locator('#left')
      .evaluate(
        (el) => getComputedStyle(el).transform === 'none' && el.getAnimations().length === 0,
      ),
  );
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
  await phone.waitForTimeout(160);
  await phone.screenshot({ path: join(out, `${browserName}-touch.png`) });
  check(
    'touch tap excites a neighbouring surface',
    await phone.locator('#left').evaluate((el) => {
      const m = new window.DOMMatrix(getComputedStyle(el).transform);
      return Math.hypot(m.m41, m.m42) > 0.01;
    }),
  );
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
