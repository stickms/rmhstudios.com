// ─────────────────────────────────────────────────────────────────────────────
// Globe eversion — capture fidelity and budget (spec §6, S#29/S#30 capture half,
// S#46; task T17).
//
// What it answers: does `lib/eversion/capture.ts` produce a picture of the
// viewport that is the picture the visitor sees, and does it do it inside the
// budget? Each combination below loads a REAL app page, asks the capture module
// for the viewport, takes a Playwright screenshot of the same viewport, and
// compares the two with SSIM on luminance.
//
//   # dev server, web only (no realtime hubs needed):
//   pnpm exec vite dev --port 7005
//   BASE_URL=http://localhost:7005 node testing/e2e/eversion-capture.mjs
//
//   node testing/e2e/eversion-capture.mjs --quick            # 1 theme, fewer routes
//   node testing/e2e/eversion-capture.mjs --routes /,/games  # pick routes
//   node testing/e2e/eversion-capture.mjs --profiles desktop # desktop | mobile
//   node testing/e2e/eversion-capture.mjs --themes graphite  # default | graphite | high-contrast
//   node testing/e2e/eversion-capture.mjs --loader bundle    # see below
//   node testing/e2e/eversion-capture.mjs --out DIR --json report.json
//
// ## How the module under test gets into the page
//
// No app code loads the capture module yet (the controller, T31, will), and a
// test-only route is not allowed — so the page is the real page and the module
// is brought to it:
//
//   --loader dev     (default) `import('/lib/eversion/capture.ts')` inside the
//                    page, against the Vite dev server. The module is the very
//                    file under review; its own `modern-screenshot` and
//                    `modern-screenshot/worker?url` imports go through Vite.
//   --loader bundle  esbuild bundles capture.ts (+ constants) into one IIFE that
//                    is injected with `addScriptTag`; the worker file is served
//                    by `page.route`. This works against ANY server — a
//                    production build included — because nothing needs Vite's
//                    module graph.
//
// Either way the page opens with `?eversion=1&eversion-debug=1`, so the module's
// `registerDebug('capture', …)` slot (`window.__eversion.capture`) is live, and
// check 6 below calls it through that door.
//
// ## What is compared, and why this way
//
// - The reference is `page.screenshot()` of the same viewport with the capture's
//   exclusion set made invisible (`display: none`, which is what removing them from the clone amounts to) —
//   the exclusions are "not the page", by design (spec §6.2).
// - Animations are paused (`document.getAnimations()`) before both pictures, so a
//   drifting aurora cannot be a difference that is not the capture's fault.
// - SSIM is computed on luminance with a 7×7 uniform window (the scikit-image
//   default shape), mean over every window position. It is implemented here
//   because `testing/e2e/lib/image-metrics.mjs` (being written alongside this
//   task) was not present; switch to it when it lands.
// - Mobile runs at deviceScaleFactor 2 and `scaleCap = 2` so the comparison is
//   pixel-for-pixel; the production cap (`CAPTURE_DPR_CAP`) only changes how many
//   pixels there are, not which ones. Desktop is DPR 1 and the timing there is
//   with the production `high` cap.
//
// ## The checks
//
//   1. fidelity   capture vs screenshot, 6 routes (+ scrolled pages) × profiles × themes
//   2. timing     cold (new session) and warm capture durations; p95 desktop ≤ 120 ms
//   3. exclusion  `.radial-hub` (the orb) is absent from the capture
//   4. hub open   the BEFORE capture taken with the menu open is the page without the
//                 blur the hub puts on it (`[data-phase='open']`)
//   5. cover      `html.eversion-cover`'s opacity:0 shell is restored on the clone
//   6. lifecycle  timeout rejects within timeout + 20 ms, abort/dispose reject
//                 `aborted`, every Worker the session created is terminated, the
//                 sandbox iframe is gone, and the next capture still works
//   7. debug      `window.__eversion.capture.captureNow()` works
//
// Exit code is non-zero if a threshold is missed. Thresholds are not options.
// ─────────────────────────────────────────────────────────────────────────────

/* global innerWidth, innerHeight, performance, requestAnimationFrame, MutationObserver, localStorage -- referenced inside page.evaluate callbacks (and `performance`, in Node) */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:7005').replace(/\/$/, '');

/* ── Thresholds (task T17 acceptance — not tunable from the command line) ── */
const SSIM_MIN = { desktop: 0.97, mobile: 0.95 };
const P95_DESKTOP_MS = 120;
const TIMEOUT_SLACK_MS = 20;

/* ── Arguments ───────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const QUICK = flag('quick');
const LOADER = opt('loader', 'dev');
const OUT = opt('out', null);
const JSON_OUT = opt('json', null);
const WARM_RUNS = Number(opt('warm', QUICK ? '3' : '6'));

/**
 * The six routes, picked because they render with an EMPTY local database for a
 * signed-out visitor, and because between them they cover the layers that make a
 * viewport crop hard: the feed shell (sticky rails, fixed FAB), a content
 * listing, a settings page, a profile route, a media-heavy grid, and a light page.
 * `scroll` adds a scrolled variant (the viewport-crop proof: fixed and sticky
 * elements must stay on screen while the document moves under them).
 */
const ALL_ROUTES = [
  { id: 'feed', path: '/', scroll: 500 },
  { id: 'explore', path: '/explore' },
  { id: 'settings', path: '/settings/appearance' },
  { id: 'profile', path: '/u/nobody' },
  { id: 'media', path: '/games', scroll: 700 },
  { id: 'light', path: '/help' },
  { id: 'long', path: '/pricing', scroll: 900 },
];
const QUICK_ROUTES = ['feed', 'media', 'settings'];

const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
/** `rmh-style` values (the localStorage key `themeScript` reads): Daylight, Midnight, High contrast. */
const THEMES = ['default', 'graphite', 'high-contrast'];

const pickList = (name, all) => {
  const v = opt(name, null);
  return v ? v.split(',') : all;
};
const routes = (() => {
  const wanted = opt('routes', null);
  if (wanted) {
    const w = wanted.split(',');
    return ALL_ROUTES.filter((r) => w.includes(r.id) || w.includes(r.path));
  }
  return QUICK ? ALL_ROUTES.filter((r) => QUICK_ROUTES.includes(r.id)) : ALL_ROUTES;
})();
const profiles = pickList('profiles', Object.keys(PROFILES));
const themes = pickList('themes', QUICK ? ['default'] : THEMES);

const CHROMIUM_PATH =
  process.env.FOUC_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

/* ── Image metrics ───────────────────────────────────────────────────────── */

/** Decode a PNG to a luminance plane. */
async function luma(png) {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Summed-area table of `f(x)` over a plane (Float64 — products reach ~10^11). */
function integral(plane, w, h, f) {
  const W = w + 1;
  const out = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += f(plane[y * w + x]);
      out[(y + 1) * W + (x + 1)] = out[y * W + (x + 1)] + row;
    }
  }
  return out;
}

/**
 * Mean SSIM of two equal-sized luminance planes: 7×7 uniform window, K1 = 0.01,
 * K2 = 0.03, data range 255, unbiased covariance (the scikit-image defaults).
 * Optionally restricted to a rectangle (for the exclusion check).
 */
function ssim(a, b, w, h, rect) {
  const WIN = 7;
  const N = WIN * WIN;
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const W = w + 1;
  const sa = integral(a, w, h, (v) => v);
  const sb = integral(b, w, h, (v) => v);
  const saa = integral(a, w, h, (v) => v * v);
  const sbb = integral(b, w, h, (v) => v * v);
  const sab = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += a[y * w + x] * b[y * w + x];
      sab[(y + 1) * W + (x + 1)] = sab[y * W + (x + 1)] + row;
    }
  }
  const box = (t, x, y) =>
    t[(y + WIN) * W + (x + WIN)] - t[y * W + (x + WIN)] - t[(y + WIN) * W + x] + t[y * W + x];
  const x0 = rect ? Math.max(0, Math.floor(rect.x)) : 0;
  const y0 = rect ? Math.max(0, Math.floor(rect.y)) : 0;
  const x1 = rect ? Math.min(w, Math.ceil(rect.x + rect.width)) : w;
  const y1 = rect ? Math.min(h, Math.ceil(rect.y + rect.height)) : h;
  let sum = 0;
  let n = 0;
  for (let y = y0; y + WIN <= y1; y++) {
    for (let x = x0; x + WIN <= x1; x++) {
      const ma = box(sa, x, y) / N;
      const mb = box(sb, x, y) / N;
      const va = (box(saa, x, y) - N * ma * ma) / (N - 1);
      const vb = (box(sbb, x, y) - N * mb * mb) / (N - 1);
      const cov = (box(sab, x, y) - N * ma * mb) / (N - 1);
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  }
  return n ? sum / n : 1;
}

/** Mean absolute luminance difference inside a rectangle (0–255). */
function mae(a, b, w, rect) {
  let s = 0;
  let n = 0;
  for (let y = Math.floor(rect.y); y < Math.ceil(rect.y + rect.height); y++) {
    for (let x = Math.floor(rect.x); x < Math.ceil(rect.x + rect.width); x++) {
      s += Math.abs(a[y * w + x] - b[y * w + x]);
      n++;
    }
  }
  return n ? s / n : 0;
}

/** Compare two PNGs; resizes `capture` to the reference size if they differ. */
async function compare(referencePng, capturePng, rect) {
  const ref = await luma(referencePng);
  let cap = await luma(capturePng);
  let resized = false;
  if (cap.width !== ref.width || cap.height !== ref.height) {
    resized = true;
    const r = await sharp(capturePng)
      .resize(ref.width, ref.height, { fit: 'fill' })
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    cap = { data: r.data, width: r.info.width, height: r.info.height };
  }
  return {
    ssim: ssim(ref.data, cap.data, ref.width, ref.height, rect),
    width: ref.width,
    height: ref.height,
    resized,
    ref,
    cap,
  };
}

const percentile = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const median = (xs) => percentile(xs, 50);

/* ── Getting the module into the page ────────────────────────────────────── */

/** Counts Worker construction/termination so leaks are visible (check 6). */
const WORKER_COUNTER_INIT = `
(() => {
  const W = window.Worker;
  window.__evWorkers = { created: 0, terminated: 0 };
  window.Worker = class extends W {
    constructor(...a) { super(...a); window.__evWorkers.created++; }
    terminate() { window.__evWorkers.terminated++; return super.terminate(); }
  };
})();
`;

let bundleSource = null;
async function bundleCapture() {
  if (bundleSource) return bundleSource;
  const result = await build({
    stdin: {
      contents: `export * as capture from './lib/eversion/capture.ts'; export * as constants from './lib/eversion/constants.ts';`,
      resolveDir: REPO,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: '__evmods',
    platform: 'browser',
    target: 'es2022',
    write: false,
    plugins: [
      {
        // `modern-screenshot/worker?url` is Vite syntax; here the worker is a
        // file the page route below serves at a fixed path.
        name: 'worker-url',
        setup(b) {
          b.onResolve({ filter: /^modern-screenshot\/worker\?url$/ }, () => ({
            path: 'worker-url',
            namespace: 'ev',
          }));
          b.onLoad({ filter: /.*/, namespace: 'ev' }, () => ({
            contents: `export default '/__ev/modern-screenshot-worker.js';`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  bundleSource = result.outputFiles[0].text;
  return bundleSource;
}

async function installModule(page) {
  if (LOADER === 'bundle') {
    const worker = readFileSync(
      join(REPO, 'node_modules/modern-screenshot/dist/worker.js'),
      'utf8',
    );
    await page.route('**/__ev/modern-screenshot-worker.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: worker }),
    );
    await page.addScriptTag({ content: await bundleCapture() });
    await page.evaluate(() => {
      window.__ev = window.__evmods;
    });
  } else {
    await page.evaluate(async () => {
      const [capture, constants] = await Promise.all([
        import('/lib/eversion/capture.ts'),
        import('/lib/eversion/constants.ts'),
      ]);
      window.__ev = { capture, constants };
    });
  }
}

/* ── Page preparation ────────────────────────────────────────────────────── */

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const imgs = [...document.images].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    });
    await Promise.race([
      Promise.all(
        imgs.map((i) =>
          i.complete
            ? 0
            : new Promise((r) => {
                i.onload = i.onerror = r;
              }),
        ),
      ),
      new Promise((r) => setTimeout(r, 6000)),
    ]);
    // Lazily loaded parts of the page (the live rail, feed cards) arrive after
    // `load`; the reference and the capture must see the same page, so wait for
    // the tree to stop changing (attribute churn from animation is ignored).
    await new Promise((resolve) => {
      let quiet;
      const done = () => {
        observer.disconnect();
        clearTimeout(cap);
        resolve();
      };
      const observer = new MutationObserver(() => {
        clearTimeout(quiet);
        quiet = setTimeout(done, 700);
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      quiet = setTimeout(done, 700);
      const cap = setTimeout(done, 8000);
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

async function freeze(page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        a.pause();
      } catch {
        /* finished */
      }
    }
  });
}

/** CSS that hides the capture's exclusion set in the reference screenshot without moving anything. */
async function excludeStyle(page) {
  const selectors = await page.evaluate(() => [...window.__ev.constants.CAPTURE_EXCLUDE_SELECTORS]);
  return `${selectors.join(',')}{display:none!important}`;
}

/**
 * Main-thread CPU time of the page's renderer, in ms, around `step`.
 *
 * Wall-clock durations are what the page can see, but the budget is "main-thread
 * time" (spec §6.2), and on a shared machine wall time includes waiting for a
 * core. The renderer's main thread is the process's leader thread, so
 * `/proc/<pid>/schedstat` (first field: ns on CPU) is exactly that. Of the
 * renderers the browser reports, the one that worked hardest during `step` is the
 * page's. Linux only; elsewhere `cpu` is NaN and the gate falls back to wall time.
 */
async function withCpu(page, step) {
  const browser = page.context().browser();
  let before = [];
  try {
    const cdp = await browser.newBrowserCDPSession();
    const read = async () => {
      const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
      return processInfo
        .filter((p) => p.type === 'renderer')
        .map((p) => [p.id, Number(readFileSync(`/proc/${p.id}/schedstat`, 'utf8').split(' ')[0])]);
    };
    before = await read();
    const wall0 = performance.now();
    const value = await step();
    const wall = performance.now() - wall0;
    const after = await read();
    await cdp.detach();
    const delta = after.map(([id, ns]) => ns - (before.find(([i]) => i === id)?.[1] ?? 0));
    return { value, wall, cpu: Math.max(0, ...delta) / 1e6 };
  } catch {
    const wall0 = performance.now();
    const value = await step();
    return { value, wall: performance.now() - wall0, cpu: NaN };
  }
}

/**
 * Capture the viewport in-page and report durations. The first capture exports a
 * PNG (outside the measured window); `runs` more captures follow on the same
 * session for the warm numbers. `cold` is what a navigation pays: a fresh session
 * plus its first capture, with the library already imported (T29 prefetches it).
 */
async function captureIn(page, { scaleCap, runs = 0, phase = 'before' }) {
  await page.evaluate(async () => {
    if (window.__evWarmed) return;
    const warmup = window.__ev.capture.createCapture();
    await warmup.createSession();
    warmup.dispose();
    window.__evWarmed = true;
  });
  const session = await withCpu(page, () =>
    page.evaluate(async () => {
      window.__evSession = window.__ev.capture.createCapture();
      await window.__evSession.createSession();
    }),
  );
  const once = () =>
    page.evaluate(
      async ({ scaleCap, phase }) => {
        const r = await window.__evSession.captureViewport({ phase, scaleCap, timeoutMs: 15000 });
        window.__evLast = r.bitmap;
        return { width: r.width, height: r.height, scale: r.scale, dur: r.durationMs };
      },
      { scaleCap, phase },
    );
  const first = await withCpu(page, once);
  const dataUrl = await page.evaluate(() => {
    const bm = window.__evLast;
    const canvas = document.createElement('canvas');
    canvas.width = bm.width;
    canvas.height = bm.height;
    canvas.getContext('2d').drawImage(bm, 0, 0);
    bm.close();
    return canvas.toDataURL('image/png');
  });
  const warm = [];
  for (let i = 0; i < runs; i++) {
    const r = await withCpu(page, once);
    warm.push({ dur: r.value.dur, cpu: r.cpu });
    await page.evaluate(() => window.__evLast.close());
  }
  await page.evaluate(() => {
    window.__evSession.dispose();
    window.__evSession = null;
  });
  return {
    dataUrl,
    info: first.value,
    session: { wall: session.wall, cpu: session.cpu },
    cold: { dur: first.value.dur, cpu: session.cpu + first.cpu, wall: session.wall + first.wall },
    warm,
  };
}

/** Warm-session timings: a fresh session, one untimed capture, then `runs` timed ones. */
async function warmRuns(page, { scaleCap, runs, phase = 'before' }) {
  await page.evaluate(async () => {
    window.__evSession = window.__ev.capture.createCapture();
    await window.__evSession.createSession();
  });
  const once = () =>
    page.evaluate(
      async ({ scaleCap, phase }) => {
        const r = await window.__evSession.captureViewport({ phase, scaleCap, timeoutMs: 15000 });
        r.bitmap.close();
        return r.durationMs;
      },
      { scaleCap, phase },
    );
  await once();
  const out = [];
  for (let i = 0; i < runs; i++) {
    const r = await withCpu(page, once);
    out.push({ dur: r.value, cpu: r.cpu });
  }
  await page.evaluate(() => {
    window.__evSession.dispose();
    window.__evSession = null;
  });
  return out;
}

/**
 * One reference/capture pair taken from a page that held still. The page is
 * allowed to change while it loads, not while it is being compared: screenshot,
 * capture, screenshot, and only when the two screenshots agree is the capture
 * judged against them. (A live rail that arrives mid-run would otherwise be a
 * "capture failure" it is not.)
 */
async function stablePair(page, { scaleCap, style, phase = 'before' }) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    await freeze(page);
    const a = await page.screenshot({ style, caret: 'hide' });
    const cap = await captureIn(page, { scaleCap, phase });
    const b = await page.screenshot({ style, caret: 'hide' });
    const drift = (await compare(a, b)).ssim;
    last = { a, b, cap, drift, attempts: attempt + 1 };
    if (drift >= 0.9995) break;
    await page.waitForTimeout(800);
  }
  return last;
}

const pngOf = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');

/* ── The run ─────────────────────────────────────────────────────────────── */

const rows = [];
const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

if (OUT) mkdirSync(OUT, { recursive: true });
const save = (name, buf) => OUT && writeFileSync(join(OUT, name), buf);

async function newPage(browser, profileName, theme) {
  const profile = PROFILES[profileName];
  const context = await browser.newContext({
    ...profile,
    reducedMotion: 'reduce',
    locale: 'en-US',
  });
  await context.addInitScript(
    ({ theme }) => {
      try {
        localStorage.setItem('rmh-style', theme);
      } catch {
        /* storage blocked */
      }
    },
    { theme },
  );
  await context.addInitScript(WORKER_COUNTER_INIT);
  const page = await context.newPage();
  page.on('pageerror', (e) => notes.push(`pageerror: ${e.message.slice(0, 160)}`));
  return { context, page };
}

async function openRoute(page, route) {
  const sep = route.path.includes('?') ? '&' : '?';
  await page.goto(`${BASE_URL}${route.path}${sep}eversion=1&eversion-debug=1`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await page.waitForSelector('.radial-shell, main, body', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await installModule(page);
}

async function fidelity(browser) {
  for (const profileName of profiles) {
    for (const theme of themes) {
      const { context, page } = await newPage(browser, profileName, theme);
      for (const route of routes) {
        for (const scrolled of route.scroll ? [false, true] : [false]) {
          const label = `${route.id}${scrolled ? '@scroll' : ''}`;
          for (let retry = 0; retry < 3; retry++) {
            try {
              await openRoute(page, route);
              await page.evaluate(() => window.scrollTo(0, 0));
              if (scrolled) {
                await page.evaluate((y) => window.scrollTo(0, y), route.scroll);
                await page.waitForTimeout(400);
              }
              const scrollY = await page.evaluate(() => Math.round(scrollY));
              if (scrolled && scrollY < 50) {
                notes.push(
                  `${profileName}/${theme}/${label}: page not scrollable (scrollY=${scrollY}); row skipped`,
                );
                break;
              }
              await settle(page);
              const profile = PROFILES[profileName];
              const style = await excludeStyle(page);
              const pair = await stablePair(page, { scaleCap: profile.deviceScaleFactor, style });
              const cap = pair.cap;
              const shot = pair.a;
              const cmp = await compare(shot, pngOf(cap.dataUrl));
              const warm = scrolled
                ? []
                : await warmRuns(page, { scaleCap: profile.deviceScaleFactor, runs: WARM_RUNS });
              const min = SSIM_MIN[profileName];
              const row = {
                profile: profileName,
                theme,
                route: label,
                scrollY,
                ssim: cmp.ssim,
                size: `${cap.info.width}x${cap.info.height}@${cap.info.scale}`,
                resized: cmp.resized,
                cold: cap.cold,
                warm,
                referenceDrift: pair.drift,
                attempts: pair.attempts,
                pass: cmp.ssim >= min,
                min,
              };
              rows.push(row);
              const tag = `${profileName}-${theme}-${label.replace('@', '-')}`;
              if (!row.pass || OUT) {
                save(`${tag}.shot.png`, shot);
                save(`${tag}.capture.png`, pngOf(cap.dataUrl));
              }
              if (!row.pass) fail(`SSIM ${cmp.ssim.toFixed(4)} < ${min} for ${tag}`);
              break;
            } catch (e) {
              if (/context was destroyed|navigation/i.test(e.message) && retry < 2) continue;
              fail(`${profileName}/${theme}/${label}: ${e.message.split('\n')[0]}`);
              rows.push({
                profile: profileName,
                theme,
                route: label,
                ssim: NaN,
                pass: false,
                error: e.message.split('\n')[0],
              });
              break;
            }
          }
        }
      }
      await context.close();
    }
  }
}

/** Checks 3–7 on the feed (desktop). */
async function behaviours(browser) {
  const { context, page } = await newPage(browser, 'desktop', 'default');
  const route = ALL_ROUTES[0];
  await openRoute(page, route);
  await settle(page);
  await freeze(page);
  const style = await excludeStyle(page);

  // 3. exclusion — the orb must not be in the capture.
  {
    const orb = await page.evaluate(() => {
      const el =
        document.querySelector('.radial-hub__orb') ?? document.querySelector('.radial-hub');
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
    if (!orb || orb.width < 8) {
      notes.push('exclusion: no visible .radial-hub__orb on the feed; check skipped');
    } else {
      const hiddenShot = await page.screenshot({ style, caret: 'hide' });
      const visibleShot = await page.screenshot({ caret: 'hide' });
      const cap = pngOf((await captureIn(page, { scaleCap: 1 })).dataUrl);
      const hidden = await luma(hiddenShot);
      const visible = await luma(visibleShot);
      const c = await luma(cap);
      const toHidden = mae(c.data, hidden.data, c.width, orb);
      const toVisible = mae(c.data, visible.data, c.width, orb);
      const orbInked = mae(hidden.data, visible.data, hidden.width, orb);
      const ok = orbInked > 1 && toHidden < toVisible;
      rows.push({
        check: 'exclusion',
        orbInkedMae: orbInked,
        captureToHiddenMae: toHidden,
        captureToVisibleMae: toVisible,
        pass: ok,
      });
      if (!ok)
        fail(
          `.radial-hub present in capture (orb rect MAE: to hidden ${toHidden.toFixed(2)}, to visible ${toVisible.toFixed(2)}, orb ink ${orbInked.toFixed(2)})`,
        );
    }
  }

  // 4. hub open — the BEFORE capture is taken while the menu is up.
  {
    const baseline = await page.screenshot({ style, caret: 'hide' });
    const orb = page.locator('.radial-hub__orb').first();
    if (await orb.count()) {
      await orb.click({ timeout: 5000 }).catch(() => {});
      await page
        .waitForSelector('.radial-hub[data-phase="open"]', { timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(900);
      const open = await page.evaluate(
        () => !!document.querySelector('.radial-hub[data-phase="open"]'),
      );
      if (!open) {
        notes.push('hub-open: the hub did not reach data-phase=open; check skipped');
      } else {
        await freeze(page);
        const cap = await captureIn(page, { scaleCap: 1 });
        const cmp = await compare(baseline, pngOf(cap.dataUrl));
        const ok = cmp.ssim >= SSIM_MIN.desktop;
        rows.push({ check: 'hub-open', ssimToPreOpenPage: cmp.ssim, pass: ok });
        save('hub-open.capture.png', pngOf(cap.dataUrl));
        if (!ok)
          fail(`hub-open capture differs from the pre-open page: SSIM ${cmp.ssim.toFixed(4)}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
      }
    } else notes.push('hub-open: no orb; check skipped');
  }

  // 5. cover — the shell's opacity:0 must not reach the capture.
  {
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await installModule(page);
    await settle(page);
    await freeze(page);
    const baseline = await page.screenshot({ style, caret: 'hide' });
    const cover = await page.evaluate(() => {
      const cls = window.__ev.constants.COVER_CLASS;
      const html = document.documentElement;
      html.classList.add(cls);
      // T19 owns the real rule; this stands in for it so the check does not wait for it.
      const s = document.createElement('style');
      s.id = '__ev_cover_probe';
      s.textContent = `html.${cls} .radial-frame, html.${cls} .radial-backdrop { opacity: 0 !important; transition: none !important; }`;
      document.head.appendChild(s);
      const f = document.querySelector('.radial-frame');
      return f ? getComputedStyle(f).opacity : 'no-frame';
    });
    if (cover !== '0') {
      notes.push(`cover: probe did not hide the shell (opacity ${cover}); check skipped`);
    } else {
      const cap = await captureIn(page, { scaleCap: 1, phase: 'after' });
      const cmp = await compare(baseline, pngOf(cap.dataUrl));
      const ok = cmp.ssim >= SSIM_MIN.desktop;
      rows.push({ check: 'cover', ssimToUncoveredPage: cmp.ssim, pass: ok });
      if (!ok)
        fail(
          `cover: capture under html.eversion-cover SSIM ${cmp.ssim.toFixed(4)} vs the uncovered page`,
        );
    }
    await page.evaluate(() => {
      document.documentElement.classList.remove(window.__ev.constants.COVER_CLASS);
      document.getElementById('__ev_cover_probe')?.remove();
    });
  }

  // 6. lifecycle
  {
    const res = await page.evaluate(async (slack) => {
      const { createCapture } = window.__ev.capture;
      const out = {};
      const before = { ...window.__evWorkers };
      const api = createCapture();
      await api.createSession();

      // timeout
      const t0 = performance.now();
      try {
        await api.captureViewport({ phase: 'before', scaleCap: 1, timeoutMs: 5 });
        out.timeout = { rejected: false };
      } catch (e) {
        out.timeout = {
          rejected: true,
          name: e.name,
          reason: e.reason,
          ms: performance.now() - t0,
        };
      }
      out.timeoutWithinSlack = out.timeout.rejected && out.timeout.ms <= 5 + slack;

      // the next capture works (a fresh session is built on demand)
      try {
        const r = await api.captureViewport({ phase: 'before', scaleCap: 1, timeoutMs: 15000 });
        out.afterTimeout = { ok: true, w: r.bitmap.width };
        r.bitmap.close();
      } catch (e) {
        out.afterTimeout = { ok: false, error: String(e) };
      }

      // abort via signal
      const ac = new AbortController();
      const p = api.captureViewport({ phase: 'before', scaleCap: 1, signal: ac.signal });
      queueMicrotask(() => ac.abort());
      try {
        await p;
        out.abort = { rejected: false };
      } catch (e) {
        out.abort = { rejected: true, reason: e.reason };
      }

      // dispose with a capture in flight
      const p2 = api.captureViewport({ phase: 'before', scaleCap: 1 });
      api.dispose();
      try {
        await p2;
        out.dispose = { rejected: false };
      } catch (e) {
        out.dispose = { rejected: true, reason: e.reason };
      }
      try {
        await api.captureViewport({ phase: 'before', scaleCap: 1 });
        out.afterDispose = { rejected: false };
      } catch (e) {
        out.afterDispose = { rejected: true, reason: e.reason };
      }

      await new Promise((r) => setTimeout(r, 400));
      const w = window.__evWorkers;
      out.workers = {
        created: w.created - before.created,
        terminated: w.terminated - before.terminated,
      };
      out.sandboxIframes = document.querySelectorAll('iframe[id^="__SANDBOX__"]').length;
      return out;
    }, TIMEOUT_SLACK_MS);
    const leaked = res.workers.created - res.workers.terminated;
    const ok =
      res.timeout.rejected &&
      res.timeout.reason === 'timeout' &&
      res.timeoutWithinSlack &&
      res.afterTimeout.ok &&
      res.abort.rejected &&
      res.abort.reason === 'aborted' &&
      res.dispose.rejected &&
      res.dispose.reason === 'aborted' &&
      res.afterDispose.rejected &&
      leaked === 0 &&
      res.sandboxIframes === 0;
    rows.push({ check: 'lifecycle', ...res, leakedWorkers: leaked, pass: ok });
    if (!ok) fail(`lifecycle: ${JSON.stringify(res)}`);
  }

  // 7. debug slot
  {
    const res = await page.evaluate(async () => {
      const { createCapture } = window.__ev.capture;
      const api = createCapture();
      const slots = window.__eversion?.slots?.() ?? [];
      const slot = window.__eversion?.capture;
      let shot = null;
      let last = null;
      if (slot) {
        const r = await slot.captureNow({ scaleCap: 1 });
        shot = { w: r.bitmap.width, h: r.bitmap.height, viewport: [innerWidth, innerHeight] };
        r.bitmap.close();
        last = slot.last();
      }
      api.dispose();
      return { slots, shot, last };
    });
    const ok =
      res.slots.includes('capture') &&
      res.shot &&
      res.shot.w === res.shot.viewport[0] &&
      res.shot.h === res.shot.viewport[1] &&
      res.last;
    rows.push({ check: 'debug-slot', ...res, pass: !!ok });
    if (!ok) fail(`debug slot: ${JSON.stringify(res)}`);
  }

  await context.close();
}

/* ── Report ──────────────────────────────────────────────────────────────── */

function report() {
  const f = (n, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : '  n/a ');
  const fid = rows.filter((r) => r.route);
  console.log(
    `\nCapture fidelity (SSIM on luminance, 7x7 uniform) — loader: ${LOADER}, base: ${BASE_URL}`,
  );
  console.log(
    'times are ms: cpu = renderer main-thread CPU, wall = elapsed (shared machine: wall >= cpu)\n',
  );
  console.log(
    'profile  theme          route            ssim    min    size            cold cpu/wall   warm cpu p50',
  );
  for (const r of fid) {
    console.log(
      `${r.profile.padEnd(8)} ${r.theme.padEnd(14)} ${r.route.padEnd(16)} ${f(r.ssim)}  ${r.min ?? ''}  ${(r.size ?? '').padEnd(15)} ${f(r.cold?.cpu, 0).padStart(5)} /${f(r.cold?.wall, 0).padStart(5)}      ${f(median((r.warm ?? []).map((w) => w.cpu)), 0).padStart(5)} ${r.pass ? '' : ' FAIL'}${r.resized ? ' (resized)' : ''}${r.error ? ' ' + r.error : ''}`,
    );
  }
  for (const profile of profiles) {
    const p = fid.filter((r) => r.profile === profile && Number.isFinite(r.ssim));
    if (!p.length) continue;
    const cold = p.map((r) => r.cold.cpu);
    const coldWall = p.map((r) => r.cold.wall);
    const warm = p.flatMap((r) => (r.warm ?? []).map((w) => w.cpu));
    console.log(
      `\n${profile}: min SSIM ${f(Math.min(...p.map((r) => r.ssim)))} (target >= ${SSIM_MIN[profile]})  ` +
        `cold cpu n=${cold.length} p50 ${f(median(cold), 0)} p95 ${f(percentile(cold, 95), 0)} (wall p95 ${f(percentile(coldWall, 95), 0)})  ` +
        `warm cpu n=${warm.length} p50 ${f(median(warm), 0)} p95 ${f(percentile(warm, 95), 0)} ms`,
    );
  }
  const desk = fid.filter((r) => r.profile === 'desktop' && Number.isFinite(r.ssim));
  if (desk.length) {
    // The gate: the BEFORE capture of a navigation is a fresh session's first capture.
    const cpus = desk.map((r) => r.cold.cpu);
    const walls = desk.map((r) => r.cold.wall);
    const useCpu = cpus.every(Number.isFinite);
    const p95 = percentile(useCpu ? cpus : walls, 95);
    const ok = p95 <= P95_DESKTOP_MS;
    console.log(
      `\ndesktop BEFORE-capture p95 (${useCpu ? 'main-thread CPU' : 'wall'}, cold session + first capture, n=${desk.length}): ${f(p95, 0)} ms (target <= ${P95_DESKTOP_MS})${ok ? '' : '  FAIL'}`,
    );
    if (!ok) fail(`desktop capture p95 ${f(p95, 0)} ms > ${P95_DESKTOP_MS} ms`);
  }
  console.log('\nBehaviour checks');
  for (const r of rows.filter((r) => r.check)) {
    const { check, pass, ...rest } = r;
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${check}  ${JSON.stringify(rest)}`);
  }
  if (notes.length) {
    console.log('\nNotes');
    for (const n of [...new Set(notes)].slice(0, 20)) console.log(`  - ${n}`);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ rows, failures, notes }, null, 2));
  console.log(
    failures.length
      ? `\nFAILED (${failures.length})\n${failures.map((x) => '  ' + x).join('\n')}`
      : '\nOK',
  );
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
try {
  await fidelity(browser);
  if (!flag('no-behaviours')) {
    try {
      await behaviours(browser);
    } catch (e) {
      fail(`behaviour checks aborted: ${e.message.split('\n')[0]}`);
    }
  }
} finally {
  await browser.close();
}
report();
process.exit(failures.length ? 1 : 0);
