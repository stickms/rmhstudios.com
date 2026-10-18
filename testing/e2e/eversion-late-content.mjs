// ─────────────────────────────────────────────────────────────────────────────
// Globe eversion - AFTER capture of a destination whose content arrives LATE
// (owner report 2026-10-18: "infrequently the 'after' page hasn't fully loaded
// when it is captured, leading to an awkward jump in page content after the
// animation finishes"; spec amendment 2026-10-18 §6.4a, the AFTER readiness gate).
//
//   pnpm exec vite dev --port 7391 --strictPort --host 127.0.0.1
//   BASE_URL=http://127.0.0.1:7391 node testing/e2e/eversion-late-content.mjs
//
//   Optional: ONLY=<scenario substring>, THEME=dark|light|high-contrast,
//   VIEW=WxH (default 720x450: a software GL is fill-bound), RUN_MS (ceiling per run),
//   MIN_SSIM (default 0.92), SAVE=<dir> (AFTER capture + settled screenshot per scenario).
//
// ## What it does
//
// The destination is Home (`/`), whose feed and side rail are React Query fetches
// that render skeletons until `/api/**` answers. Each scenario delays what the
// destination fetches (the API, and the images and fonts it shows) by 400-1500 ms
// with `page.route`, runs the REAL effect (`__eversion.controller.startTo('/')`:
// real router, runner, capture, worker host) and then compares
//
//   - the AFTER bitmap the run captured (`__eversion.afterCapture.last()`: a PNG of
//     exactly the pixels handed to the renderer), with
//   - a screenshot of the live page once the network is idle and layout is stable
//     (the capture's exclusion set made invisible, the capture's own viewport box),
//
// by SSIM on luminance. A capture of a skeleton is a different picture from the
// settled page, so an AFTER taken before the content arrived scores far below the
// threshold; a settled AFTER scores like the plain capture suite does (>= 0.97).
//
// Faking nothing but the network's latency. Exit code is non-zero on any miss.
// ─────────────────────────────────────────────────────────────────────────────

/* global performance, MutationObserver -- used only inside page.evaluate() callbacks. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { openSession, BASE_URL } from './lib/eversion-session.mjs';
import { pageShot } from './lib/eversion-drive.mjs';
import { decodeImage, ssim } from './lib/image-metrics.mjs';

const ONLY = process.env.ONLY ?? '';
const THEME = process.env.THEME ?? 'dark';
const SLOW = 120_000;
const RUN_MS = Number(process.env.RUN_MS ?? 300_000);
const MIN_SSIM = Number(process.env.MIN_SSIM ?? 0.92);
const SAVE = process.env.SAVE;
const [VW, VH] = (process.env.VIEW ?? '720x450').split('x').map(Number);

/** The delays, in the range the owner named (300-1500 ms). `serverFn` stays fast: the ROUTE settles, the CONTENT is late. */
const SCENARIOS = [
  { name: 'api-400', api: 400, assets: 0, from: '/games', to: '/' },
  { name: 'api-900', api: 900, assets: 0, from: '/games', to: '/' },
  // Home's content is late AND its images are (Games has a card per game, each with a picture).
  { name: 'api-1500-then-images-1500', api: 1500, assets: 1500, from: '/', to: '/games' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Which server function a `/_serverFn/<id>` URL names (dev: base64url JSON `{ file, export }`), or null. */
function serverFnFile(pathname) {
  try {
    const id = pathname.split('/_serverFn/')[1]?.split('/')[0];
    if (!id) return null;
    const json = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).file ?? null;
  } catch {
    return null;
  }
}

/**
 * Delay what the destination fetches. `api`: every `/api/**` call except auth and
 * the long-lived streams; `assets`: images and web fonts. Install before the page
 * loads, `arm()` just before the run.
 */
async function installDelays(page, { api, assets }) {
  let armed = false;
  // Images and fonts are delayed only once the run has STARTED: the BEFORE capture re-fetches the page it is
  // leaving, and a delay there would be a BEFORE timeout (a fallback), not the late destination under test.
  let assetsArmed = false;
  const seen = new Set();
  const stats = { api: 0, assets: 0 };
  await page.route(
    (url) => {
      const p = url.pathname;
      if (/^\/api\/(auth|feed\/stream|rum|client-errors|beacon)/.test(p)) return false;
      // Home's loader returns its first feed page UNAWAITED (a deferred server fn), so the ROUTE settles at once
      // and the content is what arrives late: that call is the one to delay (its file is routes/_site/index).
      if (/^\/_serverFn\//.test(p))
        return api > 0 && /routes\/_site\/index\.tsx/.test(serverFnFile(p) ?? '');
      if (/^\/api\//.test(p)) return api > 0;
      return assets > 0 && /\.(png|jpe?g|webp|avif|gif)$/i.test(p);
    },
    async (route) => {
      const isApi = !/\.(png|jpe?g|webp|avif|gif)$/i.test(new URL(route.request().url()).pathname);
      if (isApi ? !armed : !assetsArmed) return route.continue();
      // Late on FIRST sight only. A real browser serves the second request for an image from its cache, but
      // request interception turns Playwright's HTTP cache off, so without this the capture's own re-fetch of
      // every image would be late again and the capture (not the page) would be what times out.
      const url = route.request().url();
      if (!isApi) {
        if (seen.has(url)) return route.continue();
        seen.add(url);
      }
      stats[isApi ? 'api' : 'assets']++;
      if (process.env.TRACE) console.log('DELAY', isApi ? 'api' : 'asset', url.slice(0, 120));
      await sleep(isApi ? api : assets);
      return route.continue().catch(() => {});
    },
  );
  return {
    arm: () => {
      armed = true;
    },
    armAssets: () => {
      assetsArmed = true;
    },
    disarm: () => {
      armed = false;
      assetsArmed = false;
    },
    stats,
  };
}

/** Wait for the network to go quiet and the layout to stop moving, then settle a little more. */
async function untilSettled(page, label = '') {
  await page
    .waitForFunction(
      () =>
        new Promise((resolve) => {
          let last = performance.now();
          const mo = new MutationObserver(() => {
            last = performance.now();
          });
          mo.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['src', 'srcset', 'hidden', 'aria-busy'],
          });
          const t0 = performance.now();
          const tick = () => {
            const imgs = [...document.images].every((i) => i.complete);
            // Best effort: a page with a live ticker never goes fully quiet, so give up waiting after 15 s.
            if (
              (imgs && document.fonts.status === 'loaded' && performance.now() - last > 1200) ||
              performance.now() - t0 > 15_000
            ) {
              mo.disconnect();
              resolve(true);
            } else setTimeout(tick, 200);
          };
          tick();
        }),
      null,
      { timeout: 60_000, polling: 1000 },
    )
    .catch((e) => {
      throw new Error(`untilSettled(${label}): ${e.message.split('\n')[0]}`);
    });
}

async function scenario(sc) {
  const s = await openSession({ debug: true, theme: THEME });
  const { page } = s;
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  try {
    await page.setViewportSize({ width: VW, height: VH });
    const delays = await installDelays(page, sc);
    // Warm the dev server's compile of the destination (a cold Vite transform would be its own delay).
    await s.goto(sc.to, { timeout: SLOW });
    await page.waitForSelector('.radial-hub__orb', { timeout: SLOW });
    await untilSettled(page, 'warm-destination');
    // Armed from the page load on: the shell PRELOADS the destination's data as soon as the page is up, and a
    // held preload is what the real navigation joins (data still in flight when the visitor confirms: the
    // report's case).
    delays.arm();
    await s.goto(sc.from, { timeout: SLOW });
    await page.waitForFunction(() => !!window.__eversion?.controller, null, { timeout: SLOW });
    await page.waitForFunction(() => !!window.__eversion?.afterCapture, null, { timeout: SLOW });

    // The stats overlay is debug UI, not the page: out of the capture and out of the screenshot alike.
    await page.addStyleTag({ content: '#eversion-debug-overlay{display:none !important}' });
    await s.clearMarks();
    if (process.env.TRACE)
      page.on(
        'request',
        (r) => /\/api\/|_serverFn/.test(r.url()) && console.log('REQ', r.url().slice(0, 110)),
      );
    const startedAt = await page.evaluate(() => performance.now());
    await page.evaluate((to) => {
      window.__run = null;
      window.__eversion.controller.startTo(to).then(
        (o) => (window.__run = { outcome: o }),
        (e) => (window.__run = { error: String(e) }),
      );
    }, sc.to);
    await page.waitForFunction(
      () => performance.getEntriesByName('eversion:start', 'mark').length > 0 || window.__run,
      null,
      { timeout: RUN_MS, polling: 100 },
    );
    delays.armAssets();
    await page.waitForFunction(() => window.__run, null, { timeout: RUN_MS, polling: 500 });
    const run = await page.evaluate(() => window.__run);
    delays.disarm();
    if (run.error || run.outcome?.fallback) {
      throw new Error(`the effect did not run: ${JSON.stringify(run)}`);
    }
    const after = await page.evaluate(() => window.__eversion.afterCapture.last());
    if (!after) {
      const m = (await s.marks()).map(
        (x) =>
          `${x.name.replace('eversion:', '')}${x.detail?.reason ? `(${x.detail.reason})` : ''}`,
      );
      throw new Error(
        `no AFTER capture was recorded (the run took after-failed?) marks: ${m.join(' ')}`,
      );
    }
    if (delays.stats.api === 0)
      throw new Error('vacuous: nothing the destination fetched could be delayed');

    await untilSettled(page, 'post-run');
    const live = await pageShot(page);
    const afterPng = Buffer.from(after.png.replace(/^data:image\/png;base64,/, ''), 'base64');
    const a = await decodeImage(afterPng);
    // The capture is the fixed viewport (no scrollbar gutter): crop the screenshot to its box.
    const liveCrop = await sharp(live)
      .extract({ left: 0, top: 0, width: a.width, height: Math.min(a.height, VH) })
      .png()
      .toBuffer();
    const b = await decodeImage(liveCrop);
    const h = Math.min(a.height, b.height);
    const aa =
      a.height === h
        ? a
        : await decodeImage(
            await sharp(afterPng)
              .extract({ left: 0, top: 0, width: a.width, height: h })
              .png()
              .toBuffer(),
          );
    const score = ssim(aa, b);

    if (SAVE) {
      mkdirSync(SAVE, { recursive: true });
      writeFileSync(join(SAVE, `${sc.name}-${THEME}-after.png`), afterPng);
      writeFileSync(join(SAVE, `${sc.name}-${THEME}-live.png`), live);
    }
    const marks = await s.markTimes();
    return {
      name: sc.name,
      ssim: score,
      captureAtMs: Math.round(after.at - startedAt),
      settle: after.settle,
      delayed: { ...delays.stats },
      startToDoneMs: Math.round((marks['eversion:done'] ?? NaN) - (marks['eversion:start'] ?? NaN)),
      errors,
    };
  } finally {
    await s.close();
  }
}

const results = [];
let failed = 0;
for (const sc of SCENARIOS) {
  if (ONLY && !sc.name.includes(ONLY)) continue;
  try {
    const r = await scenario(sc);
    const ok = r.ssim >= MIN_SSIM && r.errors.length === 0;
    if (!ok) failed++;
    results.push(r);
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${r.name} (${THEME}): SSIM(AFTER, settled page) = ${r.ssim.toFixed(4)} (min ${MIN_SSIM}); ` +
        `captured ${r.captureAtMs} ms after the run began; delayed requests ${JSON.stringify(r.delayed)}; ` +
        `settle ${JSON.stringify(r.settle)}${r.errors.length ? `; errors ${r.errors.join(' | ')}` : ''}`,
    );
  } catch (e) {
    failed++;
    console.log(`FAIL ${sc.name} (${THEME}): ${e.message}`);
  }
}
console.log(failed ? `${failed} scenario(s) failed` : 'all scenarios passed');
console.log(`(base ${BASE_URL})`);
process.exit(failed ? 1 : 0);
