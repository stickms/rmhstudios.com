// ─────────────────────────────────────────────────────────────────────────────
// Steel section 17 browser check: the site tier is at rest, and the phone globe opens and closes.
//
//   pnpm build && PORT=7005 node .output/server/index.mjs
//   BASE_URL=http://localhost:7005 node testing/e2e/steel-rest.mjs
//   CHROMIUM_PATH=/path/to/chrome …           # optional: a specific browser
//
// For `/`, `/terms` and `/settings`, with the window sampled over 1.5 s once the page has settled:
//   B3, R5   no requestAnimationFrame callback is pending and none is requested
//   B3, V1   at most one WebGL context is created (HTMLCanvasElement and OffscreenCanvas getContext are wrapped before
//            any page script runs), and no Worker is constructed
// Then at 390 x 844, on `/`:
//   G7       the docked globe is a button with aria-expanded=false that controls a nav
//   G2       a tap opens it: aria-expanded flips, data-open is set, the pins are visible and inside the viewport
//   G4, G7   Escape closes it, and focus returns to the button
//   V9       once the 360 ms move is over, frames stop again (nothing pending, nothing requested)
// Exits 1 on the first failure.
// ─────────────────────────────────────────────────────────────────────────────
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL ?? 'http://localhost:7005').replace(/\/$/, '');
const ROUTES = ['/', '/terms', '/settings'];
const WINDOW_MS = 1500;

/** Runs before any page script: counts what B3 forbids. */
function instrument() {
  const stats = { pending: new Set(), requested: 0, contexts: [], workers: 0 };
  Object.defineProperty(window, '__rest', { value: stats });

  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    stats.requested += 1;
    const id = raf((t) => {
      stats.pending.delete(id);
      cb(t);
    });
    stats.pending.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    stats.pending.delete(id);
    caf(id);
  };

  const GL = /^(experimental-)?webgl2?$/;
  const wrap = (proto, name) => {
    if (!proto) return;
    const original = proto.getContext;
    proto.getContext = function (type, ...rest) {
      const ctx = original.call(this, type, ...rest);
      if (ctx && GL.test(String(type))) stats.contexts.push(`${name}:${type}`);
      return ctx;
    };
  };
  wrap(window.HTMLCanvasElement?.prototype, 'canvas');
  wrap(window.OffscreenCanvas?.prototype, 'offscreen');

  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      stats.workers += 1;
    }
  };
}

/** Sample the page for `ms`: requests made, and the most callbacks ever pending at once. */
async function sampleRest(page, ms) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const s = window.__rest;
        const startRequested = s.requested;
        let maxPending = s.pending.size;
        const timer = setInterval(() => {
          maxPending = Math.max(maxPending, s.pending.size);
        }, 25);
        setTimeout(() => {
          clearInterval(timer);
          resolve({ requested: s.requested - startRequested, maxPending, pendingNow: s.pending.size });
        }, ms);
      }),
    ms,
  );
}

const report = [];
const log = (line) => {
  report.push(line);
  console.log(line);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  // ── At rest, on three pages ────────────────────────────────────────────────
  for (const route of ROUTES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(instrument);
    const page = await context.newPage();
    await page.goto(BASE + route, { waitUntil: 'load' });
    // The chrome renderer loads at idle (up to 2 s), then paints its environment in idle slices. Wait for all of it.
    await page.waitForTimeout(4000);
    const rest = await sampleRest(page, WINDOW_MS);
    const stats = await page.evaluate(() => ({
      contexts: [...window.__rest.contexts],
      workers: window.__rest.workers,
    }));
    log(
      `${route.padEnd(10)} rAF requested ${rest.requested}, max pending ${rest.maxPending}, ` +
        `webgl contexts ${stats.contexts.length}, workers ${stats.workers}`,
    );
    assert.equal(rest.requested, 0, `${route}: ${rest.requested} requestAnimationFrame calls at rest`);
    assert.equal(rest.maxPending, 0, `${route}: a requestAnimationFrame callback was pending at rest`);
    assert.ok(stats.contexts.length <= 1, `${route}: ${stats.contexts.length} WebGL contexts (${stats.contexts})`);
    assert.equal(stats.workers, 0, `${route}: ${stats.workers} Worker(s) constructed`);
    await context.close();
  }

  // ── The phone globe ────────────────────────────────────────────────────────
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await phone.addInitScript(instrument);
  const page = await phone.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  // First-run dialogs (language, welcome) cover the page for a new visitor; close them, as a visitor would.
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }

  const globe = page.locator('button[data-globe-button]');
  assert.equal(await globe.count(), 1, 'one docked globe button');
  assert.equal(await globe.getAttribute('aria-expanded'), 'false', 'docked: aria-expanded is false');
  const controls = await globe.getAttribute('aria-controls');
  assert.ok(controls && (await page.locator(`nav[id="${controls}"]`).count()) === 1, 'aria-controls names the pins nav');
  const docked = await globe.boundingBox();
  assert.ok(docked && Math.abs(docked.width - 64) < 1, `docked globe is 64px (was ${docked?.width})`);
  assert.ok(
    Math.abs(844 - (docked.y + docked.height) - 18) < 1.5,
    `docked globe floats 18px above the bottom edge (was ${844 - (docked.y + docked.height)})`,
  );
  log(`globe      docked 64px, ${Math.round(844 - (docked.y + docked.height))}px above the bottom, aria-expanded=false`);

  await globe.tap();
  await page.waitForTimeout(700);
  assert.equal(await globe.getAttribute('aria-expanded'), 'true', 'a tap opens the globe');
  assert.ok(await page.locator('.globe-nav[data-open]').count(), 'data-open is set');
  const open = await globe.boundingBox();
  assert.ok(Math.abs(open.width - 288) < 2, `open globe is 288px (was ${open.width})`);
  assert.ok(Math.abs(open.y + open.height / 2 - 422) < 3, `open globe is centred vertically (centre ${open.y + open.height / 2})`);
  const pins = page.locator(`nav[id="${controls}"] a.globe-nav__pin`);
  assert.equal(await pins.count(), 5, 'five pins');
  for (let i = 0; i < 5; i += 1) {
    const box = await pins.nth(i).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `pin ${i} is inside the viewport`);
    assert.ok(await pins.nth(i).isVisible(), `pin ${i} is visible`);
  }
  const centre = await page.locator('.globe-nav__pin[data-slot-pos="c"]').boundingBox();
  assert.ok(Math.abs(centre.x + centre.width / 2 - 195) < 2 && Math.abs(centre.y + centre.height / 2 - 422) < 2, 'the current pin sits at 195,422');
  log('globe      tap: aria-expanded=true, 288px at the centre, five pins in view');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  assert.equal(await globe.getAttribute('aria-expanded'), 'false', 'Escape closes the globe');
  assert.equal(await page.locator('.globe-nav[data-open]').count(), 0, 'data-open is gone');
  assert.ok(await globe.evaluate((el) => el === document.activeElement), 'focus returns to the button');
  log('globe      Escape: aria-expanded=false, focus back on the button');

  const after = await sampleRest(page, WINDOW_MS);
  log(`globe      after close: rAF requested ${after.requested}, max pending ${after.maxPending}`);
  assert.equal(after.requested, 0, `${after.requested} requestAnimationFrame calls after the globe closed`);
  assert.equal(after.maxPending, 0, 'frames stop again after the globe closes');
  const stats = await page.evaluate(() => ({ contexts: window.__rest.contexts.length, workers: window.__rest.workers }));
  assert.ok(stats.contexts <= 1, `${stats.contexts} WebGL contexts on the phone`);
  assert.equal(stats.workers, 0, 'no Worker on the phone');
  log(`globe      webgl contexts ${stats.contexts}, workers ${stats.workers}`);
  await phone.close();
  console.log('\nsteel-rest: all checks passed');
} catch (error) {
  console.error('\nsteel-rest FAILED:', error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
