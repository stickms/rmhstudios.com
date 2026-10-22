// ─────────────────────────────────────────────────────────────────────────────
// Globe eversion — behaviour suite (T34; spec §11.2 S#25, 26, 29, 30, 33, 34, 35
// (light), 36, 37, 38). Playwright against a RUNNING server, driving the real
// hub: real router, real capture, real render host (SwiftShader).
//
//   # terminal 1 (a worktree needs a real `pnpm install` and, with no XAI_API_KEY
//   # in .env, a dummy one — see eversion-hub.mjs)
//   pnpm exec vite dev --port 7322 --strictPort --host 127.0.0.1
//   #   …or the built app: `pnpm build && node .output/server/index.mjs`
//
//   # terminal 2
//   BASE_URL=http://127.0.0.1:7322 node testing/e2e/eversion-behaviour.mjs --quick
//
//   --quick               one profile (desktop) × one theme (dark); click/Enter entries are
//                         fast-forwarded to `done` instead of played out (S#25 note below)
//   --profiles a,b        desktop | mobile            (default: both; --quick: desktop)
//   --themes a,b          dark | light | high-contrast (default: all; --quick: dark)
//   --only 25,33          run only these S# numbers
//   --name text           run only scenarios whose name contains this text
//   --full-entries        play every entry's run out in full even with --quick
//   --nav-slack-ms N      absolute slack added to the 5 % navigation-time bound (S#34; default 400)
//   --out DIR             failure evidence (default $EVERSION_ARTIFACT_DIR or the OS temp dir)
//   --list                print the plan and exit
//
// Every failure message starts with its S# number. Exit code is non-zero if any
// scenario fails.
//
// ## Matrix
//
// The pixel tests (S#25 release run + S#29 + S#30) run on every profile × theme,
// because SSIM depends on the theme. The rest run once per profile in the first
// theme: their subject is behaviour, not paint.
//
// ## Time on a slow rig, and what the suite adapts
//
// Under software GL on a shared box a frame takes 0.3–3 s. The timeline clamps
// each frame's `dt` to 50 ms (spec §7.7), so a 4.9 s effect then takes minutes,
// and the timeline's own waits stretch with it. A slow DESTINATION is not one of them any more (amended
// 2026-10-19): the run renders and captures the destination before the animation starts, so S#33's delay is
// plain wall time spent with the hub open, bounded by DESTINATION_SETTLE_HARD_MS.
//
// ## Notes on individual tests
//
//  S#25  Hold-release always plays out in full. Click and Enter play out in full
//        with --full-entries (CI), otherwise they are fast-forwarded right after
//        `start` (the run still goes `start … done`, in order).
//  S#26  No external pin exists in lib/sidebar-nav.ts today, so the test rewrites
//        one leaf of the nav tree in the served JS to `external: true`. It then
//        confirms that pin and asserts a full document navigation with no overlay.
//  S#34  The "within 5 % of baseline" bound is measured against the flag-off hub
//        on the same page type; an absolute slack covers timer noise on a loaded
//        box (S#41 in eversion-perf.mjs owns the precise numbers).
//  S#35  Light: back during EVERSION and a viewport resize during WRAP/EVERSION.
//        The fault rows (context loss etc.) are eversion-edge.mjs's (T33).
//  S#36  OffscreenCanvas is removed before load so the host runs in-thread; the
//        S#25/29/30 checks are repeated and the `start` mark must say `host: main`.
//  S#37  Signed-out half only (localStorage). The signed-in half needs a session
//        and is not driven here.
//  S#38  Console errors and page errors from every page of the run are collected.
// ─────────────────────────────────────────────────────────────────────────────

/* global MouseEvent, MutationObserver, HTMLCanvasElement, history, localStorage, performance -- referenced only inside page.evaluate() / init-script callbacks. */
import sharp from 'sharp';
import {
  BASE_URL,
  EVERSION_MARKS,
  launchBrowser,
  openSession,
  writeArtifact,
} from './lib/eversion-session.mjs';
import {
  RUN_MS,
  SLOW,
  leftovers,
  markMap,
  markOrderProblem,
  interceptDestination,
  openApp,
  pageShot,
  sleepUntilPage,
} from './lib/eversion-drive.mjs';
import {
  DESTINATION_SETTLE_HARD_MS,
  DESTINATION_SETTLE_SOFT_MS,
} from '../../lib/eversion/constants.ts';
import { ssim } from './lib/image-metrics.mjs';

/* ── CLI ──────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const QUICK = flag('--quick');
const PROFILES_RUN = opt('--profiles', QUICK ? 'desktop' : 'desktop,mobile').split(',');
const THEMES_RUN = opt('--themes', QUICK ? 'dark' : 'dark,light,high-contrast').split(',');
const ONLY = new Set(
  opt('--only', '')
    .split(',')
    .filter(Boolean)
    .map((n) => Number(n.replace(/^S#?/i, ''))),
);
const NAME = opt('--name', '');
const FULL_ENTRIES = flag('--full-entries') || !QUICK;
const NAV_SLACK_MS = Number(opt('--nav-slack-ms', '400'));
if (opt('--out')) process.env.EVERSION_ARTIFACT_DIR = opt('--out');

/** SSIM floors (spec §11.2 S#29/S#30). */
const SSIM_MIN = { desktop: 0.97, mobile: 0.95 };

const allErrors = [];
const results = [];
let browser = null;

/* ── Small helpers ────────────────────────────────────────────────────────── */

class Fail extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(sNum, cond, message) {
  if (!cond) throw new Fail(`S#${sNum}: ${message}`);
}

const fmt = (n, d = 0) => (typeof n === 'number' ? n.toFixed(d) : String(n));

/**
 * Page-side init scripts. Each is a `function` expression (not method shorthand,
 * which does not survive `toString()` into `(fn)()`) so Playwright can serialise it.
 */
const INIT = {
  /** Records every `history.pushState` so "navigate happened AT start" is checkable. */
  navLog: function () {
    const push = history.pushState;
    history.pushState = function (...a) {
      (window.__navAt ||= []).push({ t: performance.now(), url: String(a[2]) });
      return push.apply(this, a);
    };
  },
  /** Tells the harness whenever an `.eversion-overlay` is added anywhere. */
  overlayWatch: function () {
    const look = (n) =>
      n.nodeType === 1 &&
      (n.matches?.('.eversion-overlay') || n.querySelector?.('.eversion-overlay'));
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) if (look(n)) window.__overlayReport?.();
    }).observe(document, { childList: true, subtree: true });
  },
  /** Account `reduceMotion`, via the no-flash cache Providers hydrates the store from. */
  accountReduceMotion: function () {
    try {
      localStorage.setItem('rmh-reduce-motion', '1');
    } catch {
      /* storage blocked */
    }
  },
  /** The visitor's stored `navTransition` (signed-out cache; Providers hydrates the store from it). */
  forceTransition: function (value) {
    try {
      localStorage.setItem('rmh-nav-transition', value);
    } catch {
      /* storage blocked */
    }
  },
  /** The visitor's stored eversion level (signed-out cache; Providers hydrates the store from it). */
  forceLevel: function (value) {
    try {
      localStorage.setItem('rmh-eversion-level', value);
    } catch {
      /* storage blocked */
    }
  },
  /** Counts every pop-up globe (`.evert-popup`) added to the document. */
  popupWatch: function () {
    const look = (n) =>
      n.nodeType === 1 && (n.matches?.('.evert-popup') || n.querySelector?.('.evert-popup'));
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (look(n)) window.__popupSeen = (window.__popupSeen || 0) + 1;
    }).observe(document, { childList: true, subtree: true });
  },
  /** No `OffscreenCanvas`: the host runs the same core in-thread (spec §3.2). */
  noOffscreen: function () {
    window.OffscreenCanvas = undefined;
  },
  /** WebGL2 contexts are refused (the other half of "WebGL2 disabled" for the in-thread host). */
  noWebgl2: function () {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return get.call(this, type, ...rest);
    };
  },
  /** `createImageBitmap` fails or stalls on demand — what a BEFORE capture ends with. */
  bitmapFault: function () {
    const orig = window.createImageBitmap;
    window.createImageBitmap = function (...a) {
      if (window.__bitmapFault === 'throw') return Promise.reject(new Error('injected: capture'));
      if (typeof window.__bitmapFault === 'number') {
        const ms = window.__bitmapFault;
        return new Promise((resolve, reject) =>
          setTimeout(() => orig.apply(this, a).then(resolve, reject), ms),
        );
      }
      return orig.apply(this, a);
    };
  },
};

/**
 * A page for a scenario: session + init scripts + overlay watcher + hub driver.
 * `errors` of every page are merged into the run's S#38 pool when the scenario ends.
 */
async function newApp(ctx, opts = {}) {
  const s = await openSession({
    browser,
    profile: ctx.profile,
    theme: ctx.theme,
    debug: opts.debug ?? false,
    eversion: opts.eversion ?? true,
    reducedMotion: opts.reducedMotion,
  });
  const scripts = [INIT.navLog, INIT.overlayWatch, ...(opts.init ?? [])];
  for (const entry of scripts) {
    if (Array.isArray(entry)) await s.context.addInitScript(entry[0], entry[1]);
    else await s.context.addInitScript(entry);
  }
  const overlay = { seen: 0 };
  await s.page.exposeFunction('__overlayReport', () => {
    overlay.seen++;
  });
  const errors = [];
  ctx.sessions.push({ s, errors });
  await opts.prepare?.(s);
  const app = await openApp(s, opts.path ?? '/', { errors });
  app.overlay = overlay;
  if (opts.warm !== false) await s.page.waitForTimeout(opts.warmMs ?? 6000);
  return app;
}

/** Frame → RGBA at the viewport's CSS size, so a DPR-3 frame and a CSS screenshot compare. */
async function toViewportRgba(buffer, vp) {
  const { data, info } = await sharp(buffer)
    .resize(vp.width, vp.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

async function ssimOf(frameBuf, shotBuf, vp) {
  return ssim(await toViewportRgba(frameBuf, vp), await toViewportRgba(shotBuf, vp));
}

/** Save evidence for a failed check; returns the path (or '' when it cannot be written). */
function evidence(name, buf) {
  try {
    return writeArtifact(name, buf);
  } catch {
    return '';
  }
}

/**
 * One run through the real hub. `ff` fast-forwards right after `start`.
 * `record` records screencast frames over the run. `screenshotBefore` takes the
 * "just before the hub opened" screenshot (CSS pixels). Returns what the checks need.
 */
async function hubRun(app, { entry, href, ff = false, record = false, screenshotBefore = false }) {
  const { s, page } = app;
  let before = null;
  if (screenshotBefore) {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(500);
    before = await pageShot(page);
  }
  await app.openHub({ defer: entry === 'release' });
  await s.clearMarks();
  if (record) {
    // CSS-sized JPEG frames: a full-size PNG screencast of a software-GL page slows the
    // render itself, and a DPR 3 frame is nine times the pixels the comparison uses.
    const vp = page.viewportSize();
    await s.startRecording({
      format: 'jpeg',
      quality: 90,
      maxWidth: vp.width,
      maxHeight: vp.height,
    });
  }
  await app.confirm(entry, href);
  const start = await s.waitForMark(EVERSION_MARKS.start, { timeout: 60_000 }).catch(() => null);
  if (start && ff) {
    // After `cover`, not straight after `start`: a fast-forward before the first frame
    // lets the stage events outrun the cover message, so the marks arrive out of order.
    await s.waitForMark(EVERSION_MARKS.cover, { timeout: RUN_MS }).catch(() => {});
    await s.hurry();
  }
  const marks = await app.waitDone();
  const frames = record ? await s.stopRecording() : [];
  return { marks, frames, before, start };
}

/* ── S#25 / S#29 / S#30 / S#36: entry, cover frame, final frame ───────────── */

/** Assert the S#25 contract of a finished run. `tag` = 25 or 36. */
async function assertEntryRun(sNum, app, run, { entry, href, ctx }) {
  const { page } = app;
  const m = markMap(run.marks);
  if (m.start === undefined && !run.marks.some((x) => x.name === EVERSION_MARKS.fallback)) {
    throw new Fail(
      `S#${sNum}: the ${entry} entry produced no eversion marks at all — the hub took today's path because the effect was ineligible (chunk or host not ready?)${app.errors.length ? `; page errors: ${app.errors.slice(0, 3).join(' | ')}` : ''}`,
    );
  }
  if (run.marks.some((x) => x.name === EVERSION_MARKS.fallback) && m.start === undefined) {
    const fb = run.marks.find((x) => x.name === EVERSION_MARKS.fallback);
    throw new Fail(
      `S#${sNum}: the ${entry} entry fell back to today's navigation (reason ${fb.detail?.reason}) instead of running the effect`,
    );
  }
  const problem = markOrderProblem(run.marks);
  check(sNum, !problem, `${entry}: ${problem}`);
  const start = run.marks.find((x) => x.name === EVERSION_MARKS.start);
  check(sNum, start.detail?.entry === entry, `${entry}: start.entry=${start.detail?.entry}`);
  check(sNum, start.detail?.href === href, `${entry}: start.href=${start.detail?.href}`);
  const done = run.marks.find((x) => x.name === EVERSION_MARKS.done);
  check(sNum, done.detail?.end === 'done', `${entry}: run ended '${done.detail?.end}', not 'done'`);

  // The URL changes BEFORE start (amended 2026-10-19): the destination is rendered and captured behind the frozen
  // picture, so the globe carries it from the first frame.
  const navs = await page.evaluate(() => window.__navAt ?? []);
  const nav = navs.find((n) => n.url.startsWith(href));
  check(sNum, nav, `${entry}: no history push to ${href} was seen`);
  check(
    sNum,
    nav.t <= m.start + 1,
    `${entry}: history push at ${fmt(nav.t)} ms, after the start mark (${fmt(m.start)})`,
  );

  await page
    .waitForFunction((h) => location.pathname === h, href, { timeout: 10_000 })
    .catch(() => {});
  // Focus: spec 10.4 says "at `done`, focus goes where the router puts it for any
  // navigation"; spec 11.2 S#25 says "in the new page's main". Today's navigation (the
  // flag-off hub) is the arbiter of the first, so the check is: focus is where today's
  // navigation leaves it, or in main, and never stranded in the overlay or the hub.
  await page
    .waitForFunction(() => !!document.activeElement?.closest?.('main'), null, { timeout: 3000 })
    .catch(() => {});
  const left = await leftovers(page);
  check(sNum, left.path === href, `${entry}: landed on ${left.path}, wanted ${href}`);
  check(sNum, !left.overlay, `${entry}: .eversion-overlay is still mounted after done`);
  check(sNum, !left.cover, `${entry}: html.eversion-cover is still set after done`);
  check(sNum, !left.settle, `${entry}: data-eversion-settle is still set after done`);
  if (left.focusIn !== 'main') {
    const today = await todayBaseline(ctx);
    check(
      sNum,
      left.focusIn === today.focusIn,
      `${entry}: focus is in '${left.focusIn}' but today's navigation leaves it in '${today.focusIn}' (and S#25 asks for main)`,
    );
    ctx.numbers.push(
      `S#25 NOTE: focus after done is '${left.focusIn}', identical to today's navigation; the spec's S#25 text says main (spec 10.4 says "where the router puts it")`,
    );
  }
  check(
    sNum,
    left.orbOpacity === '1' && left.orbTab === 0,
    `${entry}: orb not back (opacity ${left.orbOpacity}, tabIndex ${left.orbTab})`,
  );
  await page.focus('.radial-hub__orb');
  check(
    sNum,
    await page.evaluate(() => document.activeElement?.classList.contains('radial-hub__orb')),
    `${entry}: the orb cannot take focus after done`,
  );
  return { m, start, done };
}

/** A screencast frame this similar to the page counts as "the canvas is showing the page". */
const PAGE_LIKE_SSIM = 0.8;

/**
 * S#29 and S#30 over a recorded release run. Both are evaluated and both are
 * reported: a failing S#29 must not hide S#30.
 *
 * S#29 — "the `cover` frame vs a screenshot taken just before the hub opened".
 * The cover mark is stamped on the main thread when the worker's message arrives;
 * the canvas reaches the compositor later, by milliseconds on a device and by
 * seconds on a software-GL rig, where the frames around the mark still show the
 * hub's blurred backdrop. So the cover frame is the FIRST screencast frame at or
 * after `start` that looks like the page at all (SSIM >= 0.8: the blurred hub
 * backdrop scores 0.5-0.7), and that is the one held to the floor. The series
 * of scores is printed so the choice can be audited.
 */
async function assertFrames(app, ctx, run, tag) {
  const { page } = app;
  const m = markMap(run.marks);
  const vp = page.viewportSize();
  const floor = SSIM_MIN[ctx.profile];
  const failures = [];
  if (run.frames.length <= 2) {
    throw new Fail(`S#29: ${tag}: the screencast produced only ${run.frames.length} frames`);
  }

  // S#29 — the first presented frame is the page that was on screen.
  const series = [];
  let cover = null;
  for (const f of run.frames.filter((x) => x.tMs >= m.start - 50)) {
    const v = await ssimOf(f.buffer, run.before, vp);
    series.push(`${fmt(f.tMs - m.cover)}ms:${fmt(v, 3)}`);
    if (!cover && v >= PAGE_LIKE_SSIM) cover = { f, v };
    if (cover && series.length >= 12) break;
    if (series.length >= 40) break;
  }
  evidence(`S29-${ctx.label}-${tag}-before.png`, run.before);
  ctx.numbers.push(
    `S#29 ${tag} frames from start (offset from the cover mark: SSIM vs the page before the hub opened): ${series.slice(0, 14).join('  ')}; start at ${fmt(m.start - m.cover)} ms`,
  );
  if (!cover) {
    failures.push(
      `S#29: ${tag}: no screencast frame between start and done resembles the page the hub was opened over (SSIM never reached ${PAGE_LIKE_SSIM}); the canvas never showed it`,
    );
  } else {
    const f1 = evidence(`S29-${ctx.label}-${tag}-cover.png`, cover.f.buffer);
    ctx.numbers.push(
      `S#29 ${tag} SSIM(first page-like frame, before-hub) = ${fmt(cover.v, 4)} (floor ${floor}), frame ${fmt(cover.f.tMs - m.cover)} ms after the cover mark`,
    );
    if (cover.v < floor) {
      failures.push(
        `S#29: ${tag}: the first frame showing the page vs the page before the hub opened: SSIM ${fmt(cover.v, 4)} < ${floor} (${f1})`,
      );
    }
  }

  // S#30 — the last frame before reveal is the live page.
  const gate = run.marks.find((x) => x.name === EVERSION_MARKS.gateOpen)?.detail?.reason;
  const lastFrames = run.frames.filter((f) => f.tMs <= m.reveal + 20);
  const last = lastFrames[lastFrames.length - 1];
  if (!last) {
    failures.push(`S#30: ${tag}: no screencast frame before reveal (${fmt(m.reveal)} ms)`);
  } else {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(1500);
    const after = await pageShot(page);
    const sLast = await ssimOf(last.buffer, after, vp);
    const f2 = evidence(`S30-${ctx.label}-${tag}-lastframe.png`, last.buffer);
    evidence(`S30-${ctx.label}-${tag}-live.png`, after);
    ctx.numbers.push(
      `S#30 ${tag} SSIM(last frame before reveal, live page) = ${fmt(sLast, 4)} (floor ${floor}; gate '${gate}'; frame ${fmt(m.reveal - last.tMs)} ms before the reveal mark)`,
    );
    if (sLast < floor) {
      failures.push(
        `S#30: ${tag}: last page frame before reveal vs the live page after done: SSIM ${fmt(sLast, 4)} < ${floor}; gate-open reason '${gate}' (${f2})`,
      );
    }
  }
  if (failures.length) throw new Fail(failures.join(' | '));
}

/** The release run: S#25 (release) + S#29 + S#30, optionally S#36 (in-thread host). */
async function releaseScenario(ctx, { inThread = false } = {}) {
  const sNum = inThread ? 36 : 25;
  const tag = inThread ? 'in-thread' : 'release';
  // Today's navigation is the arbiter of where focus lands (see assertEntryRun); measure it
  // first, on a page of its own, so two heavy pages never share a loaded box.
  await todayBaseline(ctx);
  for (let attempt = 1; attempt <= ctx.retries + 1; attempt++) {
    const app = await newApp(ctx, { init: inThread ? [INIT.noOffscreen] : [], warmMs: 8000 });
    try {
      const run = await hubRun(app, {
        entry: 'release',
        href: '/games',
        record: true,
        screenshotBefore: true,
      });
      // A rig this loaded can miss the BEFORE capture or the host's readiness window; the
      // runner then (correctly) takes today's path. That is a retry, not a verdict.
      const declined = run.marks.find((x) => x.name === EVERSION_MARKS.fallback)?.detail?.reason;
      const noRun = !run.marks.some((x) => x.name === EVERSION_MARKS.start);
      if (noRun && attempt <= ctx.retries) {
        ctx.numbers.push(
          `S#${sNum} ${tag}: attempt ${attempt} did not run the effect (${declined ?? 'ineligible'}); retrying`,
        );
        continue;
      }
      const { start } = await assertEntryRun(sNum, app, run, {
        entry: 'release',
        href: '/games',
        ctx,
      });
      if (inThread) {
        check(
          36,
          start.detail.host === 'main',
          `the start mark says host '${start.detail.host}', not 'main' — the in-thread renderer was not used`,
        );
      } else {
        check(
          25,
          start.detail.host === 'worker',
          `host '${start.detail.host}' (expected the worker on this browser)`,
        );
      }
      await assertFrames(app, ctx, run, tag);
      const d = run.marks.find((x) => x.name === EVERSION_MARKS.done).detail;
      ctx.numbers.push(
        `S#${sNum} ${tag}: frames ${d.frames}, dropped ${d.dropped}, p95 ${fmt(d.p95)} ms, wall ${fmt(markMap(run.marks).done - markMap(run.marks).start)} ms`,
      );
      return;
    } finally {
      await app.s.close();
    }
  }
}

/** Click and Enter entries (S#25). */
async function entryScenario(ctx, entry) {
  await todayBaseline(ctx);
  const app = await newApp(ctx, { warmMs: 8000 });
  try {
    const run = await hubRun(app, { entry, href: '/games', ff: !FULL_ENTRIES });
    await assertEntryRun(25, app, run, { entry, href: '/games', ctx });
    const d = run.marks.find((x) => x.name === EVERSION_MARKS.done).detail;
    ctx.numbers.push(
      `S#25 ${entry}${FULL_ENTRIES ? '' : ' (fast-forwarded)'}: frames ${d.frames}, p95 ${fmt(d.p95)} ms`,
    );
  } finally {
    await app.s.close();
  }
}

/* ── S#26: an external pin is a full navigation, with no overlay ──────────── */

async function externalPinScenario(ctx) {
  const EXTERNAL = 'http://external.test/ventures';
  // The rewrite must be in place before the FIRST load, so this does not use newApp().
  const s = await openSession({ browser, profile: ctx.profile, theme: ctx.theme, eversion: true });
  const errors = [];
  ctx.sessions.push({ s, errors });
  await s.context.addInitScript(INIT.navLog);
  await s.context.addInitScript(INIT.overlayWatch);
  const overlay = { seen: 0 };
  await s.page.exposeFunction('__overlayReport', () => {
    overlay.seen++;
  });
  let rewritten = 0;
  await s.context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith('http://external.test/')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>external</title><p>external</p>',
      });
    }
    if (req.resourceType() !== 'script' || !/sidebar-nav|\/assets\/[^?]*\.m?js(\?|$)/.test(url))
      return route.continue();
    let response;
    try {
      response = await route.fetch();
    } catch {
      return route.continue();
    }
    const body = await response.text();
    const re = /(id:\s*['"]\/ventures['"],\s*)href:\s*['"]\/ventures['"]/;
    if (!re.test(body)) return route.fulfill({ response, body });
    rewritten++;
    return route.fulfill({
      response,
      body: body.replace(re, `$1href: '${EXTERNAL}', external: true`),
    });
  });
  const app2 = await openApp(s, '/', { errors });
  const { page } = app2;
  await page.waitForTimeout(6000);
  await app2.openHub({ warmMs: 6000 });
  check(
    26,
    rewritten > 0,
    'the harness could not rewrite the nav tree to add an external pin (unsupported build layout?)',
  );
  const pin = page.locator(`.radial-globe__pins a[href="${EXTERNAL}"]`);
  check(26, (await pin.count()) === 1, 'the rewritten external pin is not in the hub');
  await s.clearMarks();
  const navigated = page.waitForURL(EXTERNAL, { timeout: 30_000 });
  await pin.evaluate((a) =>
    a.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }),
    ),
  );
  await navigated.catch(() => {
    throw new Fail(`S#26: the external pin did not navigate to ${EXTERNAL} (at ${page.url()})`);
  });
  const state = await page.evaluate(() => ({
    overlay: !!document.querySelector('.eversion-overlay'),
    marks: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('eversion:'))
      .length,
    doc: document.title,
  }));
  check(26, state.doc === 'external', 'the external destination did not load as a new document');
  check(
    26,
    overlay.seen === 0,
    `an .eversion-overlay was mounted ${overlay.seen} time(s) before the external navigation`,
  );
  check(
    26,
    !state.overlay && state.marks === 0,
    `the external page carries eversion state: ${JSON.stringify(state)}`,
  );
  ctx.numbers.push('S#26: external pin → full navigation, overlay mounted 0 times');
  await s.close();
}

/* ── S#33: slow destination ───────────────────────────────────────────────── */

/**
 * A destination whose data arrives late (amended 2026-10-19). The run renders the destination BEFORE it animates,
 * so nothing starts while the data is held: the hub stays open over the frozen picture. Released inside the free
 * window (1.2 s) the run waits for it; held to DESTINATION_SETTLE_HARD_MS (4 s) the page is captured as it is at
 * the hard bound and the final dissolve carries it onto what it became. Either way the gate opens on a ready AFTER
 * (never the stretch cap: there is no AFTER left to wait for once the globe moves).
 */
async function slowDestinationScenario(ctx, delayMs) {
  let dest = null;
  // Installed before the page loads: the shell preloads the destination's data at load,
  // so a delay armed at the click would delay nothing (see interceptDestination).
  const app = await newApp(ctx, {
    warmMs: 8000,
    prepare: async (s) => {
      dest = await interceptDestination(s.page, { mode: 'hold', match: /routes\/_site\/explore/ });
      dest.arm();
    },
  });
  const { s, page } = app;
  try {
    await app.openHub();
    await s.clearMarks();
    const confirmedAt = await page.evaluate(() => performance.now());
    await app.confirm('click', '/explore');
    const releaseAt = confirmedAt + delayMs;
    await sleepUntilPage(page, Math.min(releaseAt, confirmedAt + DESTINATION_SETTLE_SOFT_MS - 200));
    check(
      33,
      dest.held() > 0,
      `${delayMs} ms: no request for the destination's data was held, so nothing was delayed (the loader did not fetch, or its function is not under routes/_site/explore)`,
    );
    const early = await page.evaluate(
      (n) => performance.getEntriesByName(n, 'mark').length,
      EVERSION_MARKS.start,
    );
    check(
      33,
      early === 0,
      `${delayMs} ms: the animation started while the destination's data was held`,
    );
    await sleepUntilPage(page, releaseAt);
    dest.release();
    const began = await app.waitStarted();
    check(
      33,
      began.kind === 'started',
      `${delayMs} ms: the run did not start (${began.kind}${began.reason ? `: ${began.reason}` : ''})`,
    );
    const marks = await app.waitDone();
    const m = markMap(marks);
    const waited = m.start - confirmedAt;
    const reason = marks.find((x) => x.name === EVERSION_MARKS.gateOpen)?.detail?.reason;
    const done = marks.find((x) => x.name === EVERSION_MARKS.done)?.detail;
    check(33, done?.end === 'done', `${delayMs} ms: run ended '${done?.end}'`);
    ctx.numbers.push(
      `S#33 ${delayMs} ms: started ${fmt(waited)} ms after the confirm, gate-open '${reason}'`,
    );
    check(
      33,
      reason === 'after-ready',
      `${delayMs} ms: gate-open reason '${reason}', expected 'after-ready'`,
    );
    if (delayMs < DESTINATION_SETTLE_SOFT_MS) {
      check(
        33,
        waited >= delayMs,
        `${delayMs} ms: started ${fmt(waited)} ms after the confirm, before the data arrived`,
      );
    } else {
      check(
        33,
        waited >= DESTINATION_SETTLE_SOFT_MS && waited < delayMs + 30_000,
        `${delayMs} ms: started ${fmt(waited)} ms after the confirm (soft bound ${DESTINATION_SETTLE_SOFT_MS}, hard ${DESTINATION_SETTLE_HARD_MS})`,
      );
    }
    // The final crossfade lands on the live page: the destination's content is there.
    const live = await page.evaluate(() => ({
      path: location.pathname,
      text: document.querySelector('main')?.innerText.trim().length ?? 0,
      overlay: !!document.querySelector('.eversion-overlay'),
    }));
    check(
      33,
      live.path === '/explore' && live.text > 40 && !live.overlay,
      `${delayMs} ms: the live page is not showing after done: ${JSON.stringify(live)}`,
    );
  } finally {
    await s.close();
  }
}

/* ── S#34: fallbacks ──────────────────────────────────────────────────────── */

/** Click `href`'s pin in-page and time it to the router's resolved state. */
async function timeNavigation(app, href) {
  const { page } = app;
  await page.evaluate((h) => {
    window.__t0 = performance.now();
    const a = document.querySelector(`.radial-globe__pins a[href="${h}"]`);
    a.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }),
    );
  }, href);
  await page.waitForFunction(
    (h) => location.pathname === h && window.__TSR_ROUTER__?.state?.status === 'idle',
    href,
    { timeout: 60_000, polling: 'raf' },
  );
  return page.evaluate(() => performance.now() - window.__t0);
}

const todayCache = new Map();

/** Today's navigation (flag off): time to the router's resolved state, and where focus ends up. */
function todayBaseline(ctx) {
  const key = ctx.profile;
  if (!todayCache.has(key)) {
    todayCache.set(
      key,
      (async () => {
        const app = await newApp(ctx, { eversion: false, warmMs: 2000 });
        try {
          await app.openHub({ warmMs: 800 });
          const ms = await timeNavigation(app, '/games');
          await app.page.waitForTimeout(1500);
          const left = await leftovers(app.page);
          return { ms, focusIn: left.focusIn };
        } finally {
          await app.s.close();
        }
      })(),
    );
  }
  return todayCache.get(key);
}

async function baselineNavMs(ctx) {
  return (await todayBaseline(ctx)).ms;
}

const FALLBACK_CASES = [
  {
    name: 'prefers-reduced-motion',
    opts: { reducedMotion: 'reduce' },
    reasons: ['reduced-motion'],
    allowNoMark: true,
  },
  {
    name: 'account reduceMotion',
    opts: { init: [INIT.accountReduceMotion] },
    reasons: ['reduced-motion'],
    allowNoMark: true,
  },
  {
    name: 'WebGL2 disabled',
    opts: { init: [INIT.noOffscreen, INIT.noWebgl2] },
    reasons: ['no-webgl2', 'host-error'],
    allowNoMark: true,
  },
  {
    name: 'BEFORE capture throws',
    opts: { init: [INIT.bitmapFault] },
    fault: 'throw',
    reasons: ['before-missing', 'before-failed', 'before-timeout'],
  },
  {
    name: 'BEFORE capture exceeds 600 ms',
    opts: { init: [INIT.bitmapFault] },
    fault: 8000,
    hubWarmMs: 1200,
    reasons: ['before-missing', 'before-failed', 'before-timeout'],
  },
];

async function fallbackScenario(ctx, baseline) {
  for (const c of FALLBACK_CASES) {
    const app = await newApp(ctx, { ...c.opts, warmMs: 8000 });
    try {
      if (c.fault !== undefined)
        await app.page.evaluate((f) => (window.__bitmapFault = f), c.fault);
      await app.openHub({ warmMs: c.hubWarmMs });
      await app.s.clearMarks();
      const ms = await timeNavigation(app, '/games');
      await app.page.waitForTimeout(500);
      const marks = await app.s.marks();
      const names = marks.map((x) => x.name);
      check(
        34,
        !names.includes(EVERSION_MARKS.start),
        `${c.name}: the effect ran (start mark present) instead of falling back: ${JSON.stringify(marks.map((x) => [x.name, Math.round(x.startTime), x.detail]))}`,
      );
      const fb = marks.find((x) => x.name === EVERSION_MARKS.fallback);
      if (fb)
        check(
          34,
          c.reasons.includes(fb.detail?.reason),
          `${c.name}: fallback reason '${fb.detail?.reason}', expected one of ${c.reasons}`,
        );
      else
        check(
          34,
          c.allowNoMark,
          `${c.name}: no fallback mark (the controller should have reported why)`,
        );
      check(
        34,
        app.overlay.seen === 0,
        `${c.name}: an .eversion-overlay was mounted ${app.overlay.seen} time(s)`,
      );
      const left = await leftovers(app.page);
      check(
        34,
        left.path === '/games' && !left.cover && !left.overlay,
        `${c.name}: navigation did not complete cleanly: ${JSON.stringify(left)}`,
      );
      const bound = baseline * 1.05 + NAV_SLACK_MS;
      ctx.numbers.push(
        `S#34 ${c.name}: reason ${fb?.detail?.reason ?? 'ineligible (none)'}, nav ${fmt(ms)} ms vs baseline ${fmt(baseline)} ms (bound ${fmt(bound)})`,
      );
      check(
        34,
        ms <= bound,
        `${c.name}: confirmation → router resolved took ${fmt(ms)} ms, over 105 % of the flag-off baseline ${fmt(baseline)} ms + ${NAV_SLACK_MS} ms slack`,
      );
    } finally {
      await app.s.close();
    }
  }
}

/* ── S#35 (light): back and resize mid-effect ─────────────────────────────── */

async function midEffectScenario(ctx) {
  // Browser back during EVERSION → abort path, ends on the back target.
  {
    const app = await newApp(ctx, { warmMs: 8000 });
    try {
      await app.openHub();
      await app.s.clearMarks();
      await app.confirm('click', '/games');
      const began = await app.waitStarted();
      check(
        35,
        began.kind === 'started',
        `back: the run did not start (${began.kind}${began.reason ? `: ${began.reason}` : ''})`,
      );
      await app.s.waitForMark(EVERSION_MARKS.evert, { timeout: RUN_MS });
      await app.page.goBack();
      const marks = await app.waitDone();
      const done = marks.find((x) => x.name === EVERSION_MARKS.done)?.detail;
      check(35, done, 'back during EVERSION: the run never finished');
      const gate = marks.find((x) => x.name === EVERSION_MARKS.gateOpen)?.detail?.reason;
      const left = await leftovers(app.page);
      check(
        35,
        left.path === '/',
        `back during EVERSION: ended on ${left.path}, not the back target '/'`,
      );
      check(
        35,
        !left.overlay && !left.cover,
        `back during EVERSION: leftovers ${JSON.stringify(left)}`,
      );
      ctx.numbers.push(`S#35 back: end '${done.end}', gate '${gate}', landed ${left.path}`);
    } finally {
      await app.s.close();
    }
  }
  // Resize / rotation during WRAP and EVERSION → completes.
  {
    const app = await newApp(ctx, { warmMs: 8000 });
    try {
      const vp = app.page.viewportSize();
      await app.openHub();
      await app.s.clearMarks();
      await app.confirm('click', '/games');
      const began = await app.waitStarted();
      check(
        35,
        began.kind === 'started',
        `resize: the run did not start (${began.kind}${began.reason ? `: ${began.reason}` : ''})`,
      );
      await app.s.waitForMark(EVERSION_MARKS.cover, { timeout: RUN_MS });
      await app.page.setViewportSize({ width: vp.height, height: vp.width });
      await app.s.waitForMark(EVERSION_MARKS.evert, { timeout: RUN_MS });
      await app.page.setViewportSize(vp);
      await app.s.hurry(); // the claim is "completes"
      const marks = await app.waitDone();
      const done = marks.find((x) => x.name === EVERSION_MARKS.done)?.detail;
      check(
        35,
        done?.end === 'done',
        `resize during WRAP/EVERSION: run ended '${done?.end ?? 'never'}'`,
      );
      const left = await leftovers(app.page);
      check(
        35,
        left.path === '/games' && !left.overlay && !left.cover,
        `resize: leftovers ${JSON.stringify(left)}`,
      );
      ctx.numbers.push(`S#35 resize: completed, end '${done.end}'`);
    } finally {
      await app.s.close();
    }
  }
}

/* ── S#37: settings ───────────────────────────────────────────────────────── */

/** The select's option labels (settings-appearance, English). */
const NAV_LABEL = {
  random: 'Random',
  mercator: 'Mercator',
  peirce: 'Peirce quincuncial',
  stereographic: 'Stereographic',
  lambert: 'Lambert azimuthal',
  equirect: 'Equirectangular',
};
const FORCED = ['mercator', 'peirce', 'stereographic', 'lambert', 'equirect'];

async function settingsPersistScenario(ctx) {
  const app = await newApp(ctx, { path: '/settings/appearance', warm: false });
  try {
    const { page } = app;
    await page.locator('#nav-transition').waitFor({ timeout: SLOW });
    for (const opt of ['random', ...FORCED]) {
      await page.locator('#nav-transition').click();
      await page.getByRole('option', { name: NAV_LABEL[opt], exact: true }).click();
      await page
        .waitForFunction(
          (o) => (localStorage.getItem('rmh-nav-transition') ?? 'random') === o,
          opt,
          { timeout: 10_000 },
        )
        .catch(() => {
          throw new Fail(
            `S#37: choosing '${opt}' did not persist to localStorage (rmh-nav-transition)`,
          );
        });
      await page.reload({ waitUntil: 'load' });
      await page.locator('#nav-transition').waitFor({ timeout: SLOW });
      await page
        .waitForFunction(
          () => (document.querySelector('#nav-transition')?.textContent ?? '').trim() !== '',
          null,
          { timeout: 15_000 },
        )
        .catch(() => {});
      const shown = ((await page.locator('#nav-transition').textContent()) ?? '').trim();
      check(
        37,
        shown === NAV_LABEL[opt],
        `signed out: '${opt}' did not survive a reload (the select shows '${shown}', wanted '${NAV_LABEL[opt]}')`,
      );
    }
    ctx.numbers.push(
      'S#37 persistence (signed out): all six options survive a reload; signed-in half not driven',
    );
  } finally {
    await app.s.close();
  }
}

/* ── Eversion level (amended 2026-10-21): `all` vs `globe` ────────────────── */

/**
 * `globe`: a plain link navigation shows no eversion marks, no overlay and no pop-up globe, and lands normally;
 * a hub pin still runs the full effect. `all`: the same link navigation everts (marks, and the pop-up globe).
 * Signed-out half only (the level is cached in localStorage like S#37's projection).
 */
async function eversionLevelScenario(ctx) {
  const linkRun = async (level) => {
    const app = await newApp(ctx, { init: [[INIT.forceLevel, level], INIT.popupWatch] });
    const { page, s } = app;
    const link = page.locator('a[href="/games"]:visible, a[href="/explore"]:visible').first();
    check(37, (await link.count()) === 1, `level ${level}: no plain page link on the home page`);
    const href = await link.getAttribute('href');
    await s.clearMarks();
    const overlayBefore = app.overlay.seen;
    await link.click();
    await page.waitForURL((u) => u.pathname === href, { timeout: 30_000 });
    // `all` runs the whole effect: wait for it to finish before looking. `globe` has nothing to wait for.
    if (level === 'all')
      await s.waitForMark(EVERSION_MARKS.done, { timeout: RUN_MS }).catch(() => {});
    else await page.waitForTimeout(2500);
    const state = await page.evaluate(() => ({
      marks: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('eversion:'))
        .length,
      popups: window.__popupSeen || 0,
      overlayNow: !!document.querySelector('.eversion-overlay, .evert-popup'),
    }));
    const overlays = app.overlay.seen - overlayBefore;
    return { app, href, state, overlays };
  };

  const globe = await linkRun('globe');
  try {
    check(
      37,
      globe.state.marks === 0 && globe.state.popups === 0 && globe.overlays === 0,
      `globe level: a link navigation to ${globe.href} ran the effect ${JSON.stringify({ ...globe.state, overlays: globe.overlays })}`,
    );
    check(37, !globe.state.overlayNow, 'globe level: an eversion layer is on screen after a link');
    // A hub pin still runs the full effect at this level.
    const run = await hubRun(globe.app, { entry: 'click', href: '/', ff: true });
    check(
      37,
      !!run.start && markOrderProblem(run.marks) === null,
      'globe level: the hub pin did not run the full effect',
    );
  } finally {
    await globe.app.s.close();
  }

  const all = await linkRun('all');
  try {
    check(
      37,
      all.state.marks > 0 && all.state.popups > 0,
      `all level: a link navigation to ${all.href} did not evert ${JSON.stringify(all.state)}`,
    );
  } finally {
    await all.app.s.close();
  }
  ctx.numbers.push(
    'S#37 eversion level (signed out): globe = link lands with 0 marks and 0 pop-ups, hub pin everts; all = link everts',
  );
}

/** One Preview run (fast-forwarded). Returns the start mark's detail. */
async function previewOnce(app) {
  const { s, page } = app;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await s.clearMarks();
    await page.getByRole('button', { name: 'Preview' }).click();
    const hit = await page
      .waitForFunction(
        ([a, b]) => {
          const e =
            performance.getEntriesByName(a, 'mark')[0] ??
            performance.getEntriesByName(b, 'mark')[0];
          return e ? { name: e.name, detail: e.detail } : null;
        },
        [EVERSION_MARKS.start, EVERSION_MARKS.fallback],
        { timeout: 90_000, polling: 250 },
      )
      .then((h) => h.jsonValue());
    if (hit.name === EVERSION_MARKS.start) {
      await app.s.hurry();
      await app.waitDone();
      return hit.detail;
    }
    // A preview captures BEFORE on demand inside a 1 s window; a loaded box can miss it.
    await sleep(1500);
  }
  throw new Fail(
    'S#37: Preview fell back three times (BEFORE capture over its window) — rig too loaded to judge',
  );
}

async function settingsProjectionScenario(ctx) {
  const forced = QUICK ? ['peirce', 'equirect'] : FORCED;
  for (const opt of forced) {
    const app = await newApp(ctx, {
      path: '/settings/appearance',
      init: [[INIT.forceTransition, opt]],
      warmMs: 10_000,
    });
    try {
      const d = await previewOnce(app);
      check(37, d.requested === opt, `forced '${opt}': start.requested='${d.requested}'`);
      check(37, d.projection === opt, `forced '${opt}': the projection used was '${d.projection}'`);
      ctx.numbers.push(`S#37 forced ${opt}: used ${d.projection}`);
    } finally {
      await app.s.close();
    }
  }
  // Random never repeats across consecutive navigations.
  const n = QUICK ? 5 : 10;
  const app = await newApp(ctx, { path: '/settings/appearance', warmMs: 10_000 });
  try {
    const seen = [];
    for (let i = 0; i < n; i++) seen.push((await previewOnce(app)).projection);
    for (let i = 1; i < seen.length; i++) {
      check(
        37,
        seen[i] !== seen[i - 1],
        `random repeated '${seen[i]}' on consecutive navigations ${i} and ${i + 1}: ${seen.join(', ')}`,
      );
    }
    check(
      37,
      new Set(seen).size > 1,
      `random produced a single projection over ${n} navigations: ${seen.join(', ')}`,
    );
    ctx.numbers.push(`S#37 random × ${n}: ${seen.join(' ')}`);
  } finally {
    await app.s.close();
  }
}

/* ── Plan ─────────────────────────────────────────────────────────────────── */

const firstTheme = THEMES_RUN.includes('dark') ? 'dark' : THEMES_RUN[0];
/** scope: 'visual' = every profile × theme; 'profile' = each profile once; */
const PLAN = [
  {
    s: 25,
    name: 'hold-release entry + S#29 + S#30',
    scope: 'visual',
    run: (c) => releaseScenario(c),
  },
  { s: 25, name: 'pin-click entry', scope: 'profile', run: (c) => entryScenario(c, 'click') },
  { s: 25, name: 'keyboard-Enter entry', scope: 'profile', run: (c) => entryScenario(c, 'enter') },
  { s: 26, name: 'external pin', scope: 'profile', run: externalPinScenario },
  {
    s: 33,
    name: 'destination delayed 1.2 s',
    scope: 'profile',
    run: (c) => slowDestinationScenario(c, 1200),
  },
  {
    s: 33,
    name: 'destination delayed 4 s',
    scope: 'profile',
    run: (c) => slowDestinationScenario(c, 4000),
  },
  {
    s: 34,
    name: 'fallbacks',
    scope: 'profile',
    run: async (c) => fallbackScenario(c, await baselineNavMs(c)),
  },
  { s: 35, name: 'back + resize mid-effect (light)', scope: 'profile', run: midEffectScenario },
  {
    s: 36,
    name: 'in-thread host parity (25/29/30)',
    scope: 'profile',
    run: (c) => releaseScenario(c, { inThread: true }),
  },
  { s: 37, name: 'settings persistence', scope: 'once', run: settingsPersistScenario },
  { s: 37, name: 'forced projection + random', scope: 'once', run: settingsProjectionScenario },
  { s: 37, name: 'eversion level', scope: 'once', run: eversionLevelScenario },
];

function expand() {
  const out = [];
  for (const item of PLAN) {
    if (ONLY.size && !ONLY.has(item.s)) continue;
    if (NAME && !item.name.includes(NAME)) continue;
    const combos = [];
    if (item.scope === 'visual') {
      for (const profile of PROFILES_RUN)
        for (const theme of THEMES_RUN) combos.push({ profile, theme });
    } else if (item.scope === 'profile') {
      for (const profile of PROFILES_RUN) combos.push({ profile, theme: firstTheme });
    } else {
      combos.push({ profile: PROFILES_RUN[0], theme: firstTheme });
    }
    for (const c of combos) out.push({ ...item, ...c });
  }
  return out;
}

const plan = expand();
console.log(
  `eversion-behaviour: ${BASE_URL} profiles=${PROFILES_RUN} themes=${THEMES_RUN}${QUICK ? ' (quick)' : ''}`,
);
if (flag('--list')) {
  for (const p of plan) console.log(`  S#${p.s} ${p.name} [${p.profile}/${p.theme}]`);
  process.exit(0);
}

browser = await launchBrowser();
for (const item of plan) {
  const label = `${item.profile}-${item.theme}-S${item.s}`;
  const ctx = {
    profile: item.profile,
    theme: item.theme,
    label,
    sessions: [],
    numbers: [],
    retries: Number(opt('--retries', '2')),
  };
  const t0 = performance.now();
  let failure = null;
  // A renderer killed by the OS (out of memory on a shared box) is the rig's failure, not the
  // product's: retry such a scenario once, and say so.
  const INFRA =
    /Target (page, context or browser has been )?(crashed|closed)|Page crashed|Browser has been closed/;
  for (let attempt = 1; attempt <= 2; attempt++) {
    failure = null;
    try {
      await item.run(ctx);
    } catch (e) {
      failure =
        e instanceof Fail
          ? e.message
          : `S#${item.s}: unexpected ${(e?.message ?? String(e)).split('\n')[0]} @ ${(
              e?.stack ?? ''
            )
              .split('\n')
              .filter((l) => l.includes('/testing/e2e/'))
              .slice(0, 3)
              .map((l) => l.trim().replace(/^.*\/testing\/e2e\//, ''))
              .join(' < ')}`;
    } finally {
      for (const { s, errors } of ctx.sessions.splice(0)) {
        for (const e of errors)
          allErrors.push(`[${item.profile}/${item.theme} S#${item.s} ${item.name}] ${e}`);
        await s.close().catch(() => {});
      }
    }
    if (failure && attempt === 1 && INFRA.test(failure)) {
      ctx.numbers.push(`attempt 1 lost its browser page (${failure.slice(0, 80)}); retrying once`);
      ctx.numbers = [...ctx.numbers];
      continue;
    }
    break;
  }
  const secs = Math.round((performance.now() - t0) / 1000);
  results.push({ ...item, ok: !failure, failure, secs, numbers: ctx.numbers });
  console.log(
    `${failure ? 'FAIL' : 'PASS'} S#${item.s} ${item.name} [${item.profile}/${item.theme}] (${secs} s)`,
  );
  for (const n of ctx.numbers) console.log(`     ${n}`);
  if (failure) console.log(`     ${failure}`);
}
await browser.close();

/* ── S#38: no console errors across the whole run ─────────────────────────── */

if (!ONLY.size || ONLY.has(38)) {
  const ok = allErrors.length === 0;
  results.push({
    s: 38,
    name: 'no console errors or unhandled rejections',
    profile: '-',
    theme: '-',
    ok,
    failure: ok
      ? null
      : `S#38: ${allErrors.length} error(s): ${allErrors.slice(0, 5).join(' || ')}`,
    secs: 0,
    numbers: [],
  });
  console.log(
    `${ok ? 'PASS' : 'FAIL'} S#38 no console errors across the run (${allErrors.length})`,
  );
  for (const e of allErrors.slice(0, 10)) console.log(`     ${e}`);
}

const failed = results.filter((r) => !r.ok);
console.log('\nSummary');
const bySpec = new Map();
for (const r of results) {
  const prior = bySpec.get(r.s) ?? { ok: true, n: 0 };
  bySpec.set(r.s, { ok: prior.ok && r.ok, n: prior.n + 1 });
}
for (const [s, v] of [...bySpec].sort((a, b) => a[0] - b[0]))
  console.log(`  S#${s}: ${v.ok ? 'pass' : 'FAIL'} (${v.n} scenario${v.n > 1 ? 's' : ''})`);
console.log(failed.length ? `${failed.length} scenario(s) failed` : 'all scenarios passed');
process.exit(failed.length ? 1 : 0);
