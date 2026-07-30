/**
 * Canvas-2D render profiler — the 2D counterpart to the WebGL harness used for
 * docs/3d-performance-audit.md.
 *
 * The 3D audit counted draw calls by monkey-patching `WebGL2RenderingContext`.
 * The 2D games were out of its scope and had never been measured, so this does the
 * same thing one layer over: it patches `CanvasRenderingContext2D.prototype` and
 * counts the operations that actually cost time on a 2D canvas, per frame.
 *
 * What it counts and why:
 *   - rasterising ops (fill/stroke/fillRect/drawImage/fillText/…) — the 2D
 *     equivalent of a draw call.
 *   - `shadowBlur` assignments to a NON-ZERO value. A blurred shadow is the most
 *     expensive thing on a 2D canvas: it rasterises the shape to a scratch
 *     surface, blurs it, then composites. Every such assignment makes the ops
 *     that follow it dramatically more expensive.
 *   - gradient/pattern object *creations*. These are meant to be built once and
 *     reused; building one per entity per frame is pure waste.
 *   - `getComputedStyle` calls, which flush style/layout — pathological inside a
 *     frame loop.
 *
 * Usage:
 *   node scripts/perf/canvas2d-probe.mjs --route=/slice-it --seconds=15
 *   node scripts/perf/canvas2d-probe.mjs --all
 *
 * Env: BASE_URL (default http://localhost:7005). Requires the dev server to be
 * running. Routes gated behind a menu need --click selectors to reach gameplay;
 * without them the numbers describe the menu, so the script reports how many
 * frames it actually saw and refuses to summarise a route that never animated.
 */

/* The PROBE function below is serialised and evaluated in the page, so it refers
   to browser globals that do not exist in this Node script's own scope. */
/* global CanvasRenderingContext2D, PerformanceObserver */
/* eslint-disable no-console -- this script's output IS its product */

import { chromium } from 'playwright';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);

const BASE = process.env.BASE_URL || 'http://localhost:7005';
const SECONDS = Number(args.get('seconds') || 12);

/** Routes that open a 2D canvas, with the clicks needed to reach motion. */
const ROUTES = [
  { route: '/slice-it', clicks: [] },
  { route: '/neon-driftway', clicks: [] },
  { route: '/laundry-sort', clicks: [] },
  { route: '/void-breaker', clicks: [] },
  { route: '/house-always-wins', clicks: [] },
  { route: '/synapse-storm', clicks: [] },
  { route: '/temple-of-joy', clicks: [] },
];

const PROBE = () => {
  const proto = CanvasRenderingContext2D.prototype;
  const stats = {
    frames: 0,
    ops: 0,
    shadowOn: 0,
    gradients: 0,
    computedStyle: 0,
    longTasks: 0,
    worstLongTask: 0,
  };
  window.__probe = stats;

  const RASTER = [
    'fill',
    'stroke',
    'fillRect',
    'strokeRect',
    'drawImage',
    'fillText',
    'strokeText',
    'putImageData',
  ];
  for (const name of RASTER) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    proto[name] = function (...a) {
      stats.ops++;
      return orig.apply(this, a);
    };
  }

  const MAKERS = [
    'createLinearGradient',
    'createRadialGradient',
    'createConicGradient',
    'createPattern',
  ];
  for (const name of MAKERS) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    proto[name] = function (...a) {
      stats.gradients++;
      return orig.apply(this, a);
    };
  }

  // shadowBlur is an accessor on the prototype; wrap its setter so we can see how
  // often a blurred shadow is switched ON (assignments to 0 are the reset).
  const sb = Object.getOwnPropertyDescriptor(proto, 'shadowBlur');
  if (sb && sb.set) {
    Object.defineProperty(proto, 'shadowBlur', {
      ...sb,
      set(v) {
        if (v) stats.shadowOn++;
        sb.set.call(this, v);
      },
    });
  }

  const gcs = window.getComputedStyle.bind(window);
  window.getComputedStyle = function (...a) {
    stats.computedStyle++;
    return gcs(...a);
  };

  const raf = window.requestAnimationFrame.bind(window);
  const tick = () => {
    stats.frames++;
    raf(tick);
  };
  raf(tick);

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        stats.longTasks++;
        if (e.duration > stats.worstLongTask) stats.worstLongTask = e.duration;
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    /* longtask unsupported — the other counters still work */
  }
};

async function measure(browser, { route, clicks }) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    // --reduced measures the cheap path: games are expected to drop decorative
    // effects (blurred shadows, glows) under reduced motion, so comparing the two
    // runs is how you check a quality gate is actually wired up.
    ...(args.get('reduced') ? { reducedMotion: 'reduce' } : {}),
  });
  const page = await context.newPage();
  await page.addInitScript(PROBE);

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (e) {
    await context.close();
    return { route, error: `navigation: ${String(e).slice(0, 120)}` };
  }

  // Let the route hydrate and any lazy game chunk load.
  await page.waitForTimeout(6000);

  for (const sel of clicks) {
    try {
      await page.click(sel, { timeout: 4000 });
      await page.waitForTimeout(1200);
    } catch {
      /* optional step */
    }
  }

  const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));

  // Reset counters so the measurement window excludes startup/first paint.
  await page.evaluate(() => {
    const s = window.__probe;
    s.frames = s.ops = s.shadowOn = s.gradients = s.computedStyle = 0;
    s.longTasks = 0;
    s.worstLongTask = 0;
  });
  await page.waitForTimeout(SECONDS * 1000);

  const stats = await page.evaluate(() => ({ ...window.__probe }));
  await context.close();

  const frames = stats.frames || 0;
  const per = (n) => (frames ? +(n / frames).toFixed(1) : 0);
  return {
    route,
    hasCanvas,
    frames,
    fps: +(frames / SECONDS).toFixed(1),
    opsPerFrame: per(stats.ops),
    shadowOnPerFrame: per(stats.shadowOn),
    gradientsPerFrame: per(stats.gradients),
    computedStylePerFrame: per(stats.computedStyle),
    longTasks: stats.longTasks,
    worstLongTask: Math.round(stats.worstLongTask),
    animating: stats.ops > 0,
    errors: errors.slice(0, 2),
  };
}

const targets = args.get('all')
  ? ROUTES
  : args.get('route')
    ? [{ route: String(args.get('route')), clicks: [] }]
    : ROUTES;

// PLAYWRIGHT_BROWSERS_PATH points at the preinstalled browsers; let Playwright
// resolve its own bundled build unless CHROME_PATH overrides it.
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const rows = [];
for (const t of targets) {
  process.stderr.write(`measuring ${t.route} ...\n`);
  rows.push(await measure(browser, t));
}
await browser.close();

console.log(JSON.stringify(rows, null, 2));
console.log('\nroute                 fps  ops/f  shadowOn/f  grad/f  gCS/f  longTasks  worst');
for (const r of rows) {
  if (r.error) {
    console.log(`${r.route.padEnd(20)} ERROR ${r.error}`);
    continue;
  }
  if (!r.animating) {
    console.log(`${r.route.padEnd(20)} no canvas animation observed (canvas=${r.hasCanvas})`);
    continue;
  }
  console.log(
    `${r.route.padEnd(20)} ${String(r.fps).padStart(4)} ${String(r.opsPerFrame).padStart(6)} ` +
      `${String(r.shadowOnPerFrame).padStart(11)} ${String(r.gradientsPerFrame).padStart(7)} ` +
      `${String(r.computedStylePerFrame).padStart(6)} ${String(r.longTasks).padStart(10)} ` +
      `${String(r.worstLongTask).padStart(6)}`,
  );
}
