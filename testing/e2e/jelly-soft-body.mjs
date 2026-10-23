/** Jelly soft bodies in a real browser: hover, press, release, nudge, idle-at-rest (02-soft-body.md §5).
 * CHROMIUM_PATH=/path/to/chrome node testing/e2e/jelly-soft-body.mjs
 *
 * Mounts only `installJellyPhysics(document)` on a static fixture (no app server, no database) and checks that:
 * - nothing schedules a frame at rest, and no frame runs 2s after the last input;
 * - a hovered card plumps (computed `scale` deviates) and the hover does not flicker at the rest edge + 4px;
 * - a press squashes, text inside moves ≤ 4px, and the release wobbles back to computed `none`, clearing every inline
 *   value and the `data-jelly-body` attribute;
 * - a strong release nudges a neighbour; an opted-out control never moves;
 * - one frame's work (step + write for the awake bodies) stays inside the budget.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build as bundle } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const js = await bundle({
  stdin: {
    resolveDir: root,
    loader: 'ts',
    contents: `
      import { installJellyPhysics } from './lib/jelly/physics';
      import { jellyBus } from './lib/jelly/bus';
      window.__releases = [];
      jellyBus.on('body:release', (e) => window.__releases.push(e.energy));
      installJellyPhysics(document);
    `,
  },
  alias: { '@': root },
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
});

// Counts frames and times each callback, installed before the service so every rAF it requests is seen.
const probe = `
  window.__raf = { calls: 0, last: 0, worst: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    window.__raf.calls++;
    window.__raf.last = performance.now();
    return raf((t) => {
      const s = performance.now();
      cb(t);
      window.__raf.worst = Math.max(window.__raf.worst, performance.now() - s);
    });
  };
`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
});
let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS ${name}`);
}
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://jelly-soft-body.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body{margin:0;padding:40px;font:16px system-ui}
        .glass-fill{display:block;width:320px;height:160px;border-radius:16px;background:#ddd;padding:16px;box-sizing:border-box}
        .row{display:flex;gap:12px;margin-top:40px}
        button{width:120px;height:44px;border-radius:12px;border:0;background:#bbb}
      </style>
      <div id="card" class="glass-fill"><span id="card-text">A card with words</span></div>
      <div class="row">
        <button id="a"><span id="a-text">Alpha</span></button>
        <button id="b">Beta</button>
        <button id="off" data-jelly="off">Off</button>
      </div>`,
    }),
  );
  await page.goto('https://jelly-soft-body.test/');
  await page.addScriptTag({ content: probe });
  await page.addScriptTag({ content: js.outputFiles[0].text });

  const raf = () => page.evaluate(() => ({ ...window.__raf }));
  const computed = (sel, prop) =>
    page.locator(sel).evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), prop);
  const clean = (sel) =>
    page
      .locator(sel)
      .evaluate(
        (el) =>
          el.style.scale === '' &&
          el.style.translate === '' &&
          el.style.willChange === '' &&
          !el.hasAttribute('data-jelly-body') &&
          !el.hasAttribute('data-jelly-active'),
      );
  const box = (sel) => page.locator(sel).boundingBox();

  await page.waitForTimeout(500);
  check('no frames at rest', (await raf()).calls === 0);

  // ── Hover ──
  const card = await box('#card');
  await page.mouse.move(card.x + card.width * 0.75, card.y + card.height * 0.5, { steps: 4 });
  await page.waitForTimeout(400);
  const hoverScale = await computed('#card', 'scale');
  check('hover plumps the card', hoverScale !== 'none' && hoverScale !== '1');
  // 2px outside the right edge: inside the 4px hysteresis, so still hovered.
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(card.x + card.width + 2, card.y + 40 + i * 10);
    await page.waitForTimeout(30);
    check(
      `hover edge holds (${i})`,
      await page.locator('#card').evaluate((el) => el.hasAttribute('data-jelly-body')),
    );
  }
  await page.mouse.move(card.x + card.width + 60, card.y + card.height + 200, { steps: 3 });
  await page.waitForTimeout(1800);
  check('hover leave settles clean', await clean('#card'));
  check('computed scale back to none', (await computed('#card', 'scale')) === 'none');

  // ── Press, text travel, release ──
  const restText = await box('#a-text');
  const a = await box('#a');
  await page.mouse.move(a.x + a.width * 0.2, a.y + a.height * 0.3);
  await page.mouse.down();
  await page.waitForTimeout(220);
  check('press squashes', (await computed('#a', 'scale')) !== 'none');
  check(
    'press marks the body active',
    await page.locator('#a').evaluate((el) => el.hasAttribute('data-jelly-active')),
  );
  const pressedText = await box('#a-text');
  const travel = Math.max(
    Math.abs(pressedText.x - restText.x),
    Math.abs(pressedText.y - restText.y),
    Math.abs(pressedText.x + pressedText.width - (restText.x + restText.width)),
    Math.abs(pressedText.y + pressedText.height - (restText.y + restText.height)),
  );
  check(`text moves ≤ 4px (${travel.toFixed(2)}px)`, travel <= 4);
  await page.mouse.up();
  await page.waitForTimeout(80);
  check(
    'neighbour nudged by a strong release',
    await page.locator('#b').evaluate((el) => el.hasAttribute('data-jelly-body')),
  );
  check('release announced on the bus', (await page.evaluate(() => window.__releases.length)) >= 1);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1800);
  check('release wobbles back clean', (await clean('#a')) && (await clean('#b')));
  check('computed scale none after release', (await computed('#a', 'scale')) === 'none');

  // ── Idle at rest ──
  const before = await raf();
  await page.waitForTimeout(2000);
  const after = await raf();
  check('no frames 2s after the last input', after.calls === before.calls);
  console.log(`worst frame callback: ${after.worst.toFixed(2)}ms`);
  check('frame work stays small', after.worst < 4);

  // ── Opt-out ──
  const off = await box('#off');
  await page.mouse.move(off.x + off.width / 2, off.y + off.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  check('opted-out control never moves', await clean('#off'));
  await page.mouse.up();

  check('no browser exceptions', errors.length === 0);
  console.log(`${checks} checks passed.`);
} finally {
  await browser.close();
}
