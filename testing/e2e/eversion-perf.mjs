// ─────────────────────────────────────────────────────────────────────────────
// Globe eversion — performance gates (T36; spec §11.3 gates 41–46).
//
//   pnpm build && PORT=7005 node .output/server/index.mjs     # needs DATABASE_URL etc.
//   BASE_URL=http://localhost:7005 node testing/e2e/eversion-perf.mjs
//
//   … --runs 20            navigations per destination per arm (default 20; CI)
//   … --soak 20            consecutive effect navigations the soak (S#45) covers
//   … --only 41,43         run only these gates (41–46); default all
//   … --skip-frame-budget  S#42 without the frame-budget.mjs child process
//   … --update-baselines   rewrite testing/e2e/baselines/eversion-frames.json
//   … --json out.json      machine-readable results
//
//   Env: BASE_URL (default http://localhost:7005), PROFILE=desktop|mobile,
//        EVERSION_CHROMIUM, PERF_CONDITIONS (free-text label for the table).
//
// ## How a navigation is driven
//
// Faking nothing (same rig as `eversion-hub.mjs`): a real page, the real hub, the
// real router, the real worker. Each navigation opens the hub, waits for the
// BEFORE capture to be held, then dispatches the click a pointer would on the
// destination's pin — that instant is **t0, "confirmation"**. Two arms share the
// driver and differ in ONE thing, so the only variable is the effect:
//
//   effect    `?eversion=1` — the full run.
//   fallback  `?eversion=1` + `prefers-reduced-motion: reduce` — the eligibility
//             matrix's `reduced-motion` row: today's path, same page code, same hub.
//
// Both arms visit the same destinations in the same order in one long-lived page
// each (which is also what the soak needs). The six destinations are the hub's own
// pins (the only ones a hub confirmation can reach): the feed, Explore, Library
// (media-heavy), Games, Store and Developer (light).
//
// ## What each gate measures
//
//  S#41  Navigation not delayed. In-page, from t0: the instant the URL is the
//        destination ("router resolved" = path matches AND `router.state.status`
//        idle), and the instant the destination is READY (that, plus a visible
//        `<h1>` in `<main>` with text) — found by a MutationObserver AND a rAF
//        poll, whichever fires first (`largest-contentful-paint` is not re-emitted
//        on soft navigation). Gate: median effect − median fallback ≤ 30 ms AND
//        ≤ 5 %, per destination and overall (both must hold; the % is of the
//        fallback median).
//  S#42  Idle at rest. `frame-budget.mjs --gate` on the shell routes (child
//        process; its own thresholds), plus after `done` on the first navigations:
//        0 perpetual animations, ≤ 2 compositor frames/s over the second after a
//        1 s settle (DrawFrame trace events, as frame-budget does), 0 pending
//        host rAFs (`host.pendingFrames()`) and 0 `eversion-cover`/overlay leftovers.
//  S#43  Frame pacing, regression-relative. The worker's `done` stats (frames,
//        dropped, p95) pooled over the effect runs vs the committed baseline
//        `baselines/eversion-frames.json`: p95 may not regress > 15 %, the
//        dropped-frame share not > 2 points. No baseline → written (production
//        builds only); `--update-baselines` rewrites it.
//  S#44  Main thread. Long tasks (> 50 ms) between `eversion:start` and
//        `eversion:done`, MINUS what the fallback run shows for the same
//        destination in [t0, ready + 1 s] (the route's own render — diffing the
//        fallback run is the attribution). Gate: the effect adds ≤ 1 long task of
//        ≤ 120 ms (the longest long task in the effect window is held to the
//        120 ms when anything was added).
//  S#45  Soak. Over the first `--soak` effect navigations: the renderer's live GL
//        object count after every `done` equals the post-first-run baseline;
//        JS heap after a forced GC (CDP) grows ≤ 2 MB between the baseline and the
//        end; exactly 1 worker exists (CDP targets + a `Worker` constructor count).
//  S#46  Capture budget. `performance.measure`s `eversion:capture-before` /
//        `-after` (main-thread ms, emitted by capture.ts), p95 over all runs ≤ 120 ms.
//
// ## Honest labelling
//
// SwiftShader numbers are pessimistic and a dev server adds compile + HMR noise.
// The table says which build it measured (`production` / `dev-server`, detected
// from the page source), and **baselines are only ever written from a production
// build**. Exit 0 = all selected gates pass; 1 = a gate failed or a navigation
// produced no usable sample; 2 = the server is not reachable.
// ─────────────────────────────────────────────────────────────────────────────

/* global history, performance, requestAnimationFrame, MutationObserver, PerformanceObserver, MouseEvent, AbortSignal --
   referenced only inside page.evaluate()/addInitScript callbacks (run in the page) or Node 24 globals. */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareToBaseline,
  loadBaseline,
  saveBaseline,
  wantsBaselineUpdate,
} from './lib/baselines.mjs';
import {
  BASE_URL,
  EVERSION_MARKS,
  PROFILES,
  launchBrowser,
  openSession,
} from './lib/eversion-session.mjs';
import { median, percentile, summarise } from './lib/perf-stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = 'eversion-frames';
const PROFILE = process.env.PROFILE ?? 'desktop';

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i > -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const RUNS = Math.max(1, Number(argValue('--runs', 20)));
const SOAK = Math.max(2, Number(argValue('--soak', 20)));
const ONLY = new Set(
  String(argValue('--only', '41,42,43,44,45,46'))
    .split(',')
    .map((s) => s.trim().replace(/^S#/, '')),
);
const SKIP_FRAME_BUDGET = argv.includes('--skip-frame-budget');
const JSON_OUT = argValue('--json', null);
const wants = (n) => ONLY.has(String(n));

/** The hub's own pins: the destinations a hub confirmation can reach. */
const DESTINATIONS = ['/', '/explore', '/library', '/games', '/store', '/developer'];

// ── thresholds (spec §11.3) ──────────────────────────────────────────────────
const NAV_MAX_DELTA_MS = 30;
const NAV_MAX_DELTA_RATIO = 0.05;
const REST_FRAMES_PER_S = 2;
const FRAME_P95_MAX_RATIO = 1.15;
const FRAME_DROPPED_MAX_POINTS = 0.02;
const LONG_TASK_MAX_ADDED = 1;
const LONG_TASK_MAX_MS = 120;
const HEAP_MAX_GROWTH_BYTES = 2 * 1024 * 1024;
const CAPTURE_P95_MAX_MS = 120;

/** Dev servers compile on first touch; give every wait room. */
const SLOW = 120_000;
/** The whole effect on a software GL and a loaded box is slow; this is a ceiling, not a target. */
const RUN_MS = 420_000;
/** First hub open of a page: the idle host init + program compile must land before a release. */
const FIRST_WARM_MS = Number(process.env.HOST_WARM_MS ?? 9000);
const WARM_MS = 1200;
const RETRIES = 2;

// ── in-page instrumentation (installed before any page script) ───────────────
function installProbes() {
  window.__perf = { longTasks: [], workersCreated: 0, workersTerminated: 0, nav: null };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__perf.longTasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* longtask unsupported: S#44 reports it */
  }
  const NativeWorker = window.Worker;
  window.Worker = new Proxy(NativeWorker, {
    construct(target, args) {
      window.__perf.workersCreated++;
      const w = new target(...args);
      const terminate = w.terminate.bind(w);
      w.terminate = () => {
        window.__perf.workersTerminated++;
        terminate();
      };
      return w;
    },
  });
}

/**
 * Runs in the page: arm the readiness probes for `dest` and dispatch the pin click.
 * t0 is taken immediately before the dispatch. Resolves nothing; the page records
 * `window.__perf.nav = { t0, tRouter, tReady }` for Node to poll.
 */
function armAndConfirm(dest) {
  const perf = window.__perf;
  const nav = { dest, t0: 0, tRouter: null, tReady: null };
  perf.nav = nav;
  const routerIdle = () => {
    const st = window.__TSR_ROUTER__?.state;
    return st ? st.status === 'idle' && !st.isLoading : true;
  };
  const heading = () => {
    const h = document.querySelector('main h1');
    if (!h || !h.textContent?.trim()) return false;
    if (h.closest('.eversion-overlay, .radial-hub')) return false;
    const r = h.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const check = () => {
    if (nav.tReady !== null) return;
    if (location.pathname !== dest) return;
    if (nav.tRouter === null && routerIdle()) nav.tRouter = performance.now();
    if (nav.tRouter !== null && heading()) nav.tReady = performance.now();
  };
  const mo = new MutationObserver(check);
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  const tick = () => {
    check();
    if (nav.tReady === null) requestAnimationFrame(tick);
    else mo.disconnect();
  };
  const pin = document.querySelector(`.radial-globe__pins a[href="${dest}"]`);
  if (!pin) throw new Error(`no pin for ${dest}`);
  nav.t0 = performance.now();
  pin.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }),
  );
  requestAnimationFrame(tick);
}

// ── driver ───────────────────────────────────────────────────────────────────
const phase = (page) =>
  page.evaluate(() => document.querySelector('.radial-hub')?.getAttribute('data-phase'));

/** BEFORE-capture attempts that timed out/failed before one was held (a loaded box misses the 600 ms budget). */
const trace = (...a) =>
  process.env.PERF_TRACE &&
  process.stderr.write(`    ${new Date().toISOString().slice(14, 23)} ${a.join(' ')}\n`);
const captureMisses = { count: 0 };
const devOverlays = { count: 0 };

async function openHub(s, { first }) {
  for (let attempt = 0; ; attempt++) {
    // A dev-server error overlay (a failed server-function fetch, say) covers the page and
    // eats the click; it is not the effect's, so clear it and count it.
    devOverlays.count += await s.page.evaluate(() => {
      const els = document.querySelectorAll('vite-error-overlay');
      els.forEach((e) => e.remove());
      return els.length;
    });
    await s.page.click('.radial-hub__orb');
    await s.page
      .waitForFunction(
        () => document.querySelector('.radial-hub')?.getAttribute('data-phase') === 'open',
        null,
        { timeout: SLOW },
      )
      .catch(async (e) => {
        const info = await s.page
          .evaluate(() => {
            const hub = document.querySelector('.radial-hub');
            const orb = document.querySelector('.radial-hub__orb');
            const r = orb?.getBoundingClientRect();
            const top = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return JSON.stringify({
              phase: hub?.getAttribute('data-phase'),
              path: location.pathname,
              top: top && `${top.tagName}.${String(top.className).slice(0, 60)}`,
              cover: document.documentElement.className,
              overlay: !!document.querySelector('.eversion-overlay'),
            });
          })
          .catch(() => 'page unreachable');
        throw new Error(`hub did not open: ${info}`, { cause: e });
      });
    if (s.arm !== 'effect') break;
    // The BEFORE capture is scheduled after the open morph. Poll the real signal (the held
    // bitmap); if the capture failed (budget miss), close and reopen — what a visitor would do.
    const state = await (
      await s.page.waitForFunction(
        () => {
          const st = window.__eversion?.beforeCapture?.state();
          return st && (st.held || (!st.pending && st.lastError)) ? st : null;
        },
        null,
        { timeout: SLOW, polling: 250 },
      )
    ).jsonValue();
    if (state.held) break;
    captureMisses.count++;
    trace('capture miss', state.lastError);
    if (attempt >= 4) throw new Error(`BEFORE capture failed ${attempt + 1}x: ${state.lastError}`);
    await s.page.keyboard.press('Escape');
    await s.page.waitForFunction(
      () => document.querySelector('.radial-hub')?.getAttribute('data-phase') === 'closed',
      null,
      { timeout: 10_000 },
    );
    await s.page.waitForTimeout(1500);
  }
  await s.page.waitForTimeout(first ? FIRST_WARM_MS : WARM_MS);
}

async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  return (await cdp.send('Runtime.getHeapUsage')).usedSize;
}

async function workerTargets(browserCdp) {
  const { targetInfos } = await browserCdp.send('Target.getTargets');
  return targetInfos.filter((t) => t.type === 'worker').map((t) => t.url);
}

async function counters(page) {
  return page.evaluate(async () => {
    try {
      return (await window.__eversion?.renderer?.counters()) ?? null;
    } catch {
      return null;
    }
  });
}

/** One page, one arm, `count` sequential navigations round-robin over the destinations. */
async function runArm(arm, browser, count, { probeIdle }) {
  const effect = arm === 'effect';
  const s = await openSession({
    browser,
    profile: PROFILE,
    theme: 'dark',
    debug: true,
    reducedMotion: effect ? 'no-preference' : 'reduce',
  });
  s.arm = arm;
  await s.context.addInitScript(installProbes);
  const errors = [];
  s.page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const cdp = await s.context.newCDPSession(s.page);
  await cdp.send('HeapProfiler.enable');
  const browserCdp = await browser.newBrowserCDPSession();

  const start = '/games';
  await s.goto(start, { timeout: SLOW });
  await s.page.waitForSelector('.radial-hub__orb', { timeout: SLOW });
  // Post-load prefetch + host init need the page idle; the hub-open wait covers the rest.
  await s.page.waitForTimeout(effect ? 7000 : 3000);

  const samples = [];
  const soak = { liveAfterDone: [], heap: [], workers: [], created: [], preRunLive: null };
  let order = DESTINATIONS.indexOf(start);
  const nextDest = () => {
    order = (order + 1) % DESTINATIONS.length;
    return DESTINATIONS[order];
  };

  for (let i = 0; i < count; i++) {
    const dest = nextDest();
    let sample = null;
    for (let attempt = 0; attempt <= RETRIES && !sample; attempt++) {
      try {
        sample = await oneNavigation(s, cdp, browserCdp, dest, i, { effect, probeIdle, soak });
      } catch (e) {
        process.stderr.write(
          `  [${arm}] nav ${i + 1} -> ${dest} attempt ${attempt + 1}: ${e.message.split('\n')[0]}\n`,
        );
        // A run may still be in flight (a slow box): let it finish before touching the hub.
        await s.page
          .waitForFunction(
            () => ['idle', 'done'].includes(window.__eversion?.controller?.state().phase ?? 'idle'),
            null,
            { timeout: RUN_MS },
          )
          .catch(() => {});
        // Recover to a known place so the next attempt starts from a closed hub.
        if ((await phase(s.page).catch(() => null)) !== 'closed') {
          await s.page.keyboard.press('Escape').catch(() => {});
          await s.page.waitForTimeout(800);
        }
        if (new URL(s.page.url()).pathname === dest)
          order = (order + DESTINATIONS.length - 1) % DESTINATIONS.length;
      }
    }
    if (sample) {
      samples.push(sample);
      process.stdout.write(
        `  [${arm}] ${String(i + 1).padStart(3)}/${count} ${dest.padEnd(11)} ready ${sample.readyMs.toFixed(0).padStart(5)} ms` +
          (effect
            ? ` · done after ${sample.durationMs?.toFixed(0)} ms · p95 ${sample.stats?.p95?.toFixed(1)} ms`
            : '') +
          '\n',
      );
    } else {
      samples.push({ failed: true, dest });
      process.stdout.write(`  [${arm}] ${String(i + 1).padStart(3)}/${count} ${dest} FAILED\n`);
    }
  }
  const workersAtEnd = await workerTargets(browserCdp).catch(() => null);
  const created = await s.page.evaluate(() => ({
    created: window.__perf.workersCreated,
    terminated: window.__perf.workersTerminated,
  }));
  await s.close();
  return { arm, samples, soak, errors, workersAtEnd, workerCtor: created };
}

async function oneNavigation(s, cdp, browserCdp, dest, index, { effect, probeIdle, soak }) {
  const { page } = s;
  await page.evaluate(() => {
    for (const m of performance.getEntriesByType('measure')) performance.clearMeasures(m.name);
    window.__perf.longTasks.length = 0;
  });
  // The `?eversion` flag lives only in the URL (lib/eversion/flags.ts), so the router's soft
  // navigation to a bare path drops it and the NEXT hub open captures nothing (finding for T37/T39).
  // Put it back without notifying the router, so consecutive effect navigations are possible.
  await page.evaluate(() => {
    const u = new URL(location.href);
    u.searchParams.set('eversion', '1');
    u.searchParams.set('eversion-debug', '1');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  });
  trace('open hub', dest);
  await openHub(s, { first: index === 0 });
  trace('hub ready');
  if (effect && index === 0) soak.preRunLive = (await counters(page))?.live ?? null;
  await s.clearMarks();
  await page.evaluate(() => {
    window.__perf.longTasks.length = 0;
  });

  await page.evaluate(armAndConfirm, dest);
  trace('confirmed');

  let outcome;
  if (effect) {
    // Either the run starts (and ends in `done`) or the controller falls back.
    const handle = await page.waitForFunction(
      () => {
        const names = new Set(performance.getEntriesByType('mark').map((m) => m.name));
        if (names.has('eversion:done')) return 'done';
        if (names.has('eversion:fallback')) return 'fallback';
        return null;
      },
      null,
      { timeout: RUN_MS, polling: 250 },
    );
    outcome = await handle.jsonValue();
    if (outcome === 'fallback') {
      const fb = (await s.marks()).find((m) => m.name === EVERSION_MARKS.fallback);
      throw new Error(`effect fell back (${fb?.detail?.reason}) — not a valid effect sample`);
    }
  }
  await page.waitForFunction(() => window.__perf.nav.tReady !== null, null, {
    timeout: RUN_MS,
    polling: 100,
  });
  await page.waitForFunction(
    () => document.querySelector('.radial-hub')?.getAttribute('data-phase') === 'closed',
    null,
    { timeout: 30_000 },
  );
  // Let the destination's own post-ready work (and its long tasks) land before reading.
  await page.waitForTimeout(1000);

  const data = await page.evaluate(() => {
    const nav = window.__perf.nav;
    const marks = {};
    for (const m of performance.getEntriesByType('mark'))
      if (m.name.startsWith('eversion:'))
        marks[m.name] = { t: m.startTime, detail: m.detail ?? null };
    const measures = {};
    for (const m of performance.getEntriesByType('measure'))
      if (m.name.startsWith('eversion:')) (measures[m.name] ??= []).push(m.duration);
    return {
      nav,
      marks,
      measures,
      longTasks: window.__perf.longTasks.slice(),
      path: location.pathname,
    };
  });
  if (data.path !== dest) throw new Error(`landed on ${data.path}, wanted ${dest}`);

  const sample = {
    dest,
    routerMs: data.nav.tRouter - data.nav.t0,
    readyMs: data.nav.tReady - data.nav.t0,
    t0: data.nav.t0,
    tReady: data.nav.tReady,
    measures: data.measures,
  };

  if (effect) {
    const start = data.marks[EVERSION_MARKS.start];
    const done = data.marks[EVERSION_MARKS.done];
    if (!start || !done) throw new Error('missing eversion:start / :done marks');
    sample.start = start.t;
    sample.done = done.t;
    sample.durationMs = done.t - start.t;
    sample.end = done.detail?.end;
    sample.stats = {
      frames: done.detail?.frames,
      dropped: done.detail?.dropped,
      p95: done.detail?.p95,
    };
    sample.longInRun = data.longTasks.filter(
      (t) => t.start + t.dur >= start.t && t.start <= done.t,
    );
    // The destination's own render window (same definition as the fallback arm).
    sample.longInRender = data.longTasks.filter(
      (t) => t.start >= data.nav.t0 && t.start <= data.nav.tReady + 1000,
    );
    sample.entryOk = start.detail?.entry === 'click';

    soak.created.push(await page.evaluate(() => window.__perf.workersCreated));
    const c = await counters(page);
    soak.liveAfterDone.push(c ? c.live : null);
    if (index === 0 || index === SOAK - 1 || (index + 1) % 5 === 0) {
      soak.heap.push({ index, bytes: await heap(cdp) });
    }
    soak.workers.push(await workerTargets(browserCdp).catch(() => null));

    if (probeIdle && index < 3) sample.idle = await idleAfterDone(s, cdp, browserCdp);
  } else {
    sample.longInRender = data.longTasks.filter(
      (t) => t.start >= data.nav.t0 && t.start <= data.nav.tReady + 1000,
    );
  }
  return sample;
}

/** S#42 after `done`: perpetual animations, compositor frames/s over 1 s after a 1 s settle, worker rAF. */
async function idleAfterDone(s, _cdp, browserCdp) {
  await s.page.waitForTimeout(1000);
  await browserCdp.send('Tracing.start', {
    categories: 'disabled-by-default-devtools.timeline.frame',
    transferMode: 'ReturnAsStream',
  });
  await s.page.waitForTimeout(1000);
  const events = [];
  const done = new Promise((resolveDone) => {
    browserCdp.once('Tracing.tracingComplete', async ({ stream }) => {
      let text = '';
      for (;;) {
        const chunk = await browserCdp.send('IO.read', { handle: stream });
        text += chunk.data;
        if (chunk.eof) break;
      }
      await browserCdp.send('IO.close', { handle: stream });
      resolveDone(text);
    });
  });
  await browserCdp.send('Tracing.end');
  const text = await done;
  try {
    const parsed = JSON.parse(text);
    events.push(...(parsed.traceEvents ?? parsed));
  } catch {
    /* unparsable trace: frames stays null */
  }
  const dom = await s.page.evaluate(() => ({
    infinite: document
      .getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
      .map((a) => a.animationName ?? a.constructor.name),
    pendingFrames: window.__eversion?.host?.pendingFrames?.() ?? null,
    overlay: !!document.querySelector('.eversion-overlay'),
    cover: document.documentElement.classList.contains('eversion-cover'),
  }));
  return {
    framesPerSec: events.length ? events.filter((e) => e.name === 'DrawFrame').length : null,
    ...dom,
  };
}

// ── gates ────────────────────────────────────────────────────────────────────
const rows = []; // summary table rows
const failures = [];
function row(gate, metric, value, threshold, status, note = '') {
  rows.push({ gate, metric, value, threshold, status, note });
  if (status === 'FAIL') failures.push(`${gate} ${metric}: ${value} (limit ${threshold}) ${note}`);
}
const fmt = (n, d = 1) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—');

function gate41(effect, fallback) {
  const valid = (r) => r.samples.filter((x) => !x.failed);
  const group = (r, dest) => valid(r).filter((x) => x.dest === dest);
  const perDest = {};
  for (const dest of DESTINATIONS) {
    const e = group(effect, dest);
    const f = group(fallback, dest);
    if (!e.length || !f.length) {
      row(
        'S#41',
        `${dest} Δ ready`,
        '—',
        `≤ ${NAV_MAX_DELTA_MS} ms & ≤ ${NAV_MAX_DELTA_RATIO * 100}%`,
        'FAIL',
        `no samples (effect ${e.length}, fallback ${f.length})`,
      );
      continue;
    }
    for (const key of ['routerMs', 'readyMs']) {
      const me = median(e.map((x) => x[key]));
      const mf = median(f.map((x) => x[key]));
      const delta = me - mf;
      const ratio = mf > 0 ? delta / mf : 0;
      const ok = delta <= NAV_MAX_DELTA_MS && ratio <= NAV_MAX_DELTA_RATIO;
      perDest[`${dest}:${key}`] = {
        effect: me,
        fallback: mf,
        delta,
        ratio,
        n: [e.length, f.length],
      };
      row(
        'S#41',
        `${dest} ${key === 'readyMs' ? 'ready' : 'router'}`,
        `${fmt(delta)} ms (${fmt(ratio * 100)}%)`,
        `≤ ${NAV_MAX_DELTA_MS} ms & ≤ ${NAV_MAX_DELTA_RATIO * 100}%`,
        ok ? 'PASS' : 'FAIL',
        `effect ${fmt(me, 0)} / fallback ${fmt(mf, 0)} ms, n=${e.length}/${f.length}`,
      );
    }
  }
  for (const key of ['routerMs', 'readyMs']) {
    const me = median(valid(effect).map((x) => x[key]));
    const mf = median(valid(fallback).map((x) => x[key]));
    const delta = me - mf;
    const ratio = mf > 0 ? delta / mf : 0;
    row(
      'S#41',
      `ALL ${key === 'readyMs' ? 'ready' : 'router'}`,
      `${fmt(delta)} ms (${fmt(ratio * 100)}%)`,
      `≤ ${NAV_MAX_DELTA_MS} ms & ≤ ${NAV_MAX_DELTA_RATIO * 100}%`,
      delta <= NAV_MAX_DELTA_MS && ratio <= NAV_MAX_DELTA_RATIO ? 'PASS' : 'FAIL',
      `effect ${fmt(me, 0)} / fallback ${fmt(mf, 0)} ms`,
    );
  }
  return perDest;
}

function gate42(effect) {
  const idles = effect.samples.map((x) => x.idle).filter(Boolean);
  if (!idles.length) {
    row('S#42', 'idle after done', '—', '', 'FAIL', 'no post-done probe ran');
    return;
  }
  const worstFps = Math.max(...idles.map((i) => i.framesPerSec ?? Infinity));
  row(
    'S#42',
    'frames/s after done',
    fmt(worstFps),
    `≤ ${REST_FRAMES_PER_S}`,
    worstFps <= REST_FRAMES_PER_S ? 'PASS' : 'FAIL',
    `worst of ${idles.length} runs`,
  );
  const infinite = idles.flatMap((i) => i.infinite);
  row(
    'S#42',
    'perpetual animations after done',
    String(infinite.length),
    '0',
    infinite.length === 0 ? 'PASS' : 'FAIL',
    infinite.slice(0, 3).join(', '),
  );
  const pending = idles.map((i) => i.pendingFrames);
  const worstPending = pending.some((p) => p === null) ? null : Math.max(...pending);
  row(
    'S#42',
    'worker/host loop running after done',
    worstPending === null ? 'n/a' : String(worstPending),
    '0 pending rAF',
    worstPending === 0 ? 'PASS' : 'FAIL',
    worstPending === null ? 'host.pendingFrames unavailable' : 'host.pendingFrames()',
  );
  const leftovers = idles.filter((i) => i.overlay || i.cover).length;
  row('S#42', 'overlay/cover leftovers', String(leftovers), '0', leftovers === 0 ? 'PASS' : 'FAIL');
}

function runFrameBudget() {
  if (SKIP_FRAME_BUDGET) {
    row('S#42', 'frame-budget.mjs --gate', 'skipped', '', 'SKIP', '--skip-frame-budget');
    return;
  }
  const routes = ['/?eversion=1', '/explore?eversion=1'];
  const args = [join(HERE, 'frame-budget.mjs'), '--gate', ...routes.flatMap((r) => ['--route', r])];
  const r = spawnSync(process.execPath, args, {
    env: { ...process.env, BASE_URL },
    encoding: 'utf8',
    timeout: 300_000,
  });
  process.stdout.write(
    (r.stdout ?? '')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => `  [frame-budget] ${l}`)
      .join('\n') + '\n',
  );
  row(
    'S#42',
    'frame-budget.mjs --gate',
    `exit ${r.status}`,
    'exit 0',
    r.status === 0 ? 'PASS' : 'FAIL',
    routes.join(' '),
  );
}

function gate43(effect, production) {
  const stats = effect.samples.filter((x) => x.stats && typeof x.stats.p95 === 'number');
  if (!stats.length)
    return row('S#43', 'frame stats', '—', '', 'FAIL', 'no `done` stats collected');
  const frames = stats.reduce((a, x) => a + x.stats.frames, 0);
  const dropped = stats.reduce((a, x) => a + x.stats.dropped, 0);
  const current = {
    p95: +median(stats.map((x) => x.stats.p95)).toFixed(2),
    droppedShare: +(frames ? dropped / frames : 0).toFixed(4),
    framesPerRun: +median(stats.map((x) => x.stats.frames)).toFixed(0),
  };
  const baseline = loadBaseline(BASELINE);
  const update = wantsBaselineUpdate();
  const label = `p95 ${current.p95} ms, dropped ${(current.droppedShare * 100).toFixed(2)}%, ${current.framesPerRun} frames/run, n=${stats.length}`;
  if (update || !baseline) {
    if (production) {
      const file = saveBaseline(BASELINE, {
        ...current,
        profile: PROFILE,
        runs: stats.length,
        build: 'production',
      });
      row(
        'S#43',
        'frame pacing',
        label,
        'baseline',
        'PASS',
        `baseline ${update ? 'rewritten' : 'created'}: ${file}`,
      );
    } else {
      row(
        'S#43',
        'frame pacing',
        label,
        'baseline',
        'INFO',
        `NOT written: ${update ? 'dev-server build' : 'no baseline committed'} — baselines come from production builds only`,
      );
    }
    return;
  }
  const cmp = compareToBaseline(current, baseline, {
    p95: { maxRatio: FRAME_P95_MAX_RATIO },
    droppedShare: { maxDelta: FRAME_DROPPED_MAX_POINTS },
  });
  row(
    'S#43',
    'frame pacing',
    label,
    `p95 ≤ ${FRAME_P95_MAX_RATIO * 100}% & dropped ≤ +${FRAME_DROPPED_MAX_POINTS * 100} pts`,
    cmp.ok ? 'PASS' : 'FAIL',
    cmp.rows.map((r) => `${r.metric} ${r.current} vs ${r.baseline}`).join('; '),
  );
}

function gate44(effect, fallback) {
  const eff = effect.samples.filter((x) => x.longInRun);
  if (!eff.length) return row('S#44', 'long tasks', '—', '', 'FAIL', 'no effect samples');
  const baselineFor = (dest) =>
    median(
      fallback.samples
        .filter((x) => !x.failed && x.dest === dest)
        .map((x) => x.longInRender?.length ?? 0),
    );
  const added = eff.map((x) => Math.max(0, x.longInRun.length - baselineFor(x.dest)));
  const longest = Math.max(0, ...eff.flatMap((x) => x.longInRun.map((t) => t.dur)));
  const worstAdded = Math.max(...added);
  const med = median(added);
  row(
    'S#44',
    'effect-added long tasks (max over runs)',
    String(worstAdded),
    `≤ ${LONG_TASK_MAX_ADDED}`,
    worstAdded <= LONG_TASK_MAX_ADDED ? 'PASS' : 'FAIL',
    `median ${fmt(med)}; raw per run median ${median(eff.map((x) => x.longInRun.length))}; n=${eff.length}`,
  );
  row(
    'S#44',
    `longest long task in :start→:done`,
    `${fmt(longest, 0)} ms`,
    `≤ ${LONG_TASK_MAX_MS} ms`,
    longest <= LONG_TASK_MAX_MS ? 'PASS' : worstAdded === 0 ? 'INFO' : 'FAIL',
    worstAdded === 0
      ? 'all attributable to the route render (fallback run has them too)'
      : 'attributed to the effect',
  );
  const fbLong = median(
    fallback.samples.filter((x) => !x.failed).map((x) => x.longInRender?.length ?? 0),
  );
  row('S#44', 'fallback long tasks (route render only)', fmt(fbLong), 'reference', 'INFO');
}

function gate45(effect) {
  const live = effect.soak.liveAfterDone.slice(0, SOAK);
  const n = live.length;
  if (n < 2) return row('S#45', 'soak', '—', '', 'FAIL', `only ${n} effect navigations completed`);
  const known = live.filter((v) => v !== null);
  if (!known.length) {
    row('S#45', 'GL live objects', 'n/a', '', 'FAIL', 'renderer.counters() unavailable');
  } else {
    const base = known[0];
    const drift = known.map((v) => v - base);
    const bad = drift.filter((d) => d !== 0).length;
    row(
      'S#45',
      'GL live objects after each done',
      `${bad} of ${known.length} differ from baseline ${base}`,
      '0 differ',
      bad === 0 ? 'PASS' : 'FAIL',
      `series: ${known.join(',')}; before first run: ${effect.soak.preRunLive}`,
    );
  }
  const hs = effect.soak.heap.filter((h) => h.index < SOAK);
  if (hs.length >= 2) {
    const growth = hs[hs.length - 1].bytes - hs[0].bytes;
    row(
      'S#45',
      `JS heap growth (nav ${hs[0].index + 1}→${hs[hs.length - 1].index + 1}, after GC)`,
      `${(growth / 1048576).toFixed(2)} MB`,
      `≤ ${HEAP_MAX_GROWTH_BYTES / 1048576} MB`,
      growth <= HEAP_MAX_GROWTH_BYTES ? 'PASS' : 'FAIL',
      `series MB: ${hs.map((h) => (h.bytes / 1048576).toFixed(1)).join(', ')}`,
    );
  } else row('S#45', 'JS heap growth', '—', '', 'FAIL', 'fewer than 2 heap samples');
  const lists = effect.soak.workers.filter(Boolean);
  const maxWorkers = Math.max(0, ...lists.map((l) => l.length), effect.workersAtEnd?.length ?? 0);
  const widest = lists.find((l) => l.length === maxWorkers) ?? [];
  const created = Math.max(0, ...effect.soak.created);
  row(
    'S#45',
    'workers alive',
    String(maxWorkers),
    '= 1',
    maxWorkers === 1 ? 'PASS' : 'FAIL',
    `new Worker calls ${created}, terminated ${effect.workerCtor.terminated}; widest set: ${widest.map((u) => u.split('/').slice(-2).join('/').slice(0, 70)).join(' | ')}`,
  );
}

function gate46(effect) {
  for (const [name, label] of [
    ['eversion:capture-before', 'before'],
    ['eversion:capture-after', 'after'],
  ]) {
    const v = effect.samples.flatMap((x) => x.measures?.[name] ?? []);
    if (!v.length) {
      row(
        'S#46',
        `capture ${label} p95`,
        '—',
        `≤ ${CAPTURE_P95_MAX_MS} ms`,
        'FAIL',
        'no measures emitted',
      );
      continue;
    }
    const p = percentile(v, 0.95);
    row(
      'S#46',
      `capture ${label} p95`,
      `${fmt(p, 0)} ms`,
      `≤ ${CAPTURE_P95_MAX_MS} ms`,
      p <= CAPTURE_P95_MAX_MS ? 'PASS' : 'FAIL',
      `median ${fmt(median(v), 0)}, max ${fmt(Math.max(...v), 0)}, n=${v.length}`,
    );
  }
}

function printTable(conditions) {
  const w = (s, n) => String(s).padEnd(n);
  const cols = [6, 46, 26, 28, 6];
  console.log(`\nEVERSION PERF SUMMARY — ${conditions}`);
  console.log(
    [
      w('gate', cols[0]),
      w('metric', cols[1]),
      w('value', cols[2]),
      w('limit', cols[3]),
      'status',
      ' note',
    ].join(' '),
  );
  console.log('-'.repeat(150));
  for (const r of rows) {
    console.log(
      [
        w(r.gate, cols[0]),
        w(r.metric, cols[1]),
        w(r.value, cols[2]),
        w(r.threshold, cols[3]),
        w(r.status, cols[4]),
        ' ' + r.note,
      ].join(' '),
    );
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function detectBuild() {
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(180_000) });
    const html = await res.text();
    return /\/@(id|vite)\//.test(html) ? 'dev-server' : 'production';
  } catch {
    return null;
  }
}

const build = await detectBuild();
if (!build) {
  console.error(`eversion-perf: ${BASE_URL} is not reachable`);
  process.exit(2);
}
const production = build === 'production';
const conditions =
  process.env.PERF_CONDITIONS ??
  `${build}, SwiftShader (software GL), ${PROFILE} ${PROFILES[PROFILE].viewport.width}x${PROFILES[PROFILE].viewport.height}, ${RUNS} runs/destination` +
    (production ? '' : ', loaded box — NOT comparable to CI');
console.log(`eversion-perf: ${BASE_URL} · ${conditions}`);

const needNav = [41, 42, 43, 44, 45, 46].some(wants);
let effect = null;
let fallback = null;
if (needNav) {
  const browser = await launchBrowser();
  try {
    const arms = (process.env.PERF_ARMS ?? 'effect,fallback').split(',');
    const effectCount = Math.max(RUNS * DESTINATIONS.length, wants(45) ? SOAK : 0);

    if (arms.includes('effect'))
      effect = await runArm('effect', browser, effectCount, { probeIdle: wants(42) });
    if (arms.includes('fallback') && (wants(41) || wants(44))) {
      const fbCount = Math.max(RUNS * DESTINATIONS.length, 0);
      console.log(`\nfallback arm (reduced motion): ${fbCount} navigations`);
      fallback = await runArm('fallback', browser, fbCount, { probeIdle: false });
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const failedNavs = [effect, fallback]
    .filter(Boolean)
    .flatMap((r) => r.samples.filter((x) => x.failed).map((x) => `${r.arm}:${x.dest}`));
  if (failedNavs.length)
    failures.push(`navigations with no usable sample: ${failedNavs.join(', ')}`);
  for (const r of [effect, fallback].filter(Boolean)) {
    if (r.errors.length)
      failures.push(`${r.arm} arm page errors: ${r.errors.slice(0, 3).join(' | ')}`);
  }
}

let perDest = null;
if (wants(41) && effect && fallback) perDest = gate41(effect, fallback);
if (wants(42)) {
  if (effect) gate42(effect);
  runFrameBudget();
}
if (wants(43) && effect) gate43(effect, production);
if (wants(44) && effect && fallback) gate44(effect, fallback);
if (wants(45) && effect) gate45(effect);
if (wants(46) && effect) gate46(effect);

if (wants(46) || wants(41))
  console.log(
    `\nBEFORE-capture attempts that missed the budget and were retried: ${captureMisses.count}; dev error overlays cleared: ${devOverlays.count}`,
  );
printTable(conditions);
if (JSON_OUT) {
  writeFileSync(
    resolve(JSON_OUT),
    JSON.stringify(
      { conditions, build, rows, perDest, summary: effect ? summarise(effect.samples) : null },
      null,
      2,
    ),
  );
}
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nall selected gates passed');
