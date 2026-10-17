// ─────────────────────────────────────────────────────────────────────────────
// Globe eversion — zero cost to page load (T29; spec §8.1, §11.3 test 40).
//
//   pnpm build   # or build:frontend:sourcemap — see "Chunk identification"
//   PORT=7005 node .output/server/index.mjs        # needs DATABASE_URL etc.
//   BASE_URL=http://localhost:7005 node testing/e2e/eversion-load.mjs
//
//   … --runs 10               runs per route and flag state (default 10)
//   … --update-baselines      rewrite testing/e2e/baselines/eversion-load.json
//
// ## What it asserts
//
// For `/`, `/explore` (site shell → RadialHub mounted) and `/lights-out` (a
// full-screen game → no hub):
//
//  A. **Nothing before `load`.** With the feature ON (`?eversion`), no request
//     for an eversion chunk, the worker, the capture module or
//     `modern-screenshot` starts before the navigation's `loadEventStart`
//     (Resource Timing, so it is on the page's own clock, not Playwright's).
//  B. **Prefetch happens, after `load`.** On the shell routes the
//     `eversion:prefetch` mark exists and its `startTime` is >= `loadEventStart`
//     (the mark ordering check), and the chunks were then requested. This is the
//     positive control that keeps (A) from passing vacuously.
//  C. **Nothing on a full-screen route**, flag on or off, ever.
//  D. **Flag OFF changes nothing**: no eversion request at all, no mark.
//  E. **LCP and TBT** medians over N cold loads (fresh context each run, so no
//     HTTP cache), flag OFF — i.e. what visitors get — compared with the
//     committed baseline JSON (`lib/baselines.mjs`; a MISSING baseline fails; `--update-baselines` writes it),
//     and flag ON vs flag OFF in the SAME run, which is the less noisy
//     comparison: prefetch is post-`load`, so ON must not be worse.
//
// ## Chunk identification
//
// Emitted chunk names are content hashes, so a request URL says nothing. The
// eversion chunks are found by (1) file name (`eversion`, `worker`, `capture`,
// `modern-screenshot` — Rolldown names a chunk after its entry module and the
// worker keeps its file name), and (2) their content, using the same
// `EVERSION_RUNTIME_MODULES` list the bundle gate uses (sourcemap `sources`
// when the build emitted maps, string fingerprints otherwise), scanned over the
// build output at `BUILD_DIR` (default `.output/public`). Build with
// `build:frontend:sourcemap` for the strongest identification. If the build dir
// is not readable the name match alone is used and a warning says so.
//
// ## Environment
//
//   BASE_URL            default http://localhost:7005 (the built server)
//   BUILD_DIR           default .output/public
//   EVERSION_CHROMIUM   Chromium binary (see lib/eversion-session.mjs)
//
// Exit 0 = all assertions pass (metrics within baseline); 1 otherwise; 2 = the
// server is not reachable (nothing was asserted).
// ─────────────────────────────────────────────────────────────────────────────

/* global performance, PerformanceObserver, Image -- referenced only inside page.evaluate() / addInitScript
   callbacks, which Playwright serialises and runs in the page. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVERSION_RUNTIME_MODULES } from '../../scripts/check-bundle-budget.ts';
import {
  compareToBaseline,
  loadBaseline,
  saveBaseline,
  wantsBaselineUpdate,
} from './lib/baselines.mjs';
import { EVERSION_MARKS, launchBrowser } from './lib/eversion-session.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:7005').replace(/\/$/, '');
const BUILD_DIR = resolve(ROOT, process.env.BUILD_DIR ?? '.output/public');
const BASELINE = 'eversion-load';

const argRuns = process.argv.indexOf('--runs');
const RUNS = argRuns > -1 ? Number(process.argv[argRuns + 1]) : 10;

/** [route, hubMounted]. The game route is full-screen: no shell, no hub, no prefetch. */
const ROUTES = [
  ['/', true],
  ['/explore', true],
  ['/lights-out', false],
];

/** Metric rules vs the committed baseline. Shared CI boxes are noisy, hence the generous bands. */
/* (compareToBaseline fails a metric on EITHER rule, so each metric gets the one that suits it: LCP is
   relative, TBT is often ~0 where a ratio is meaningless.) */
const RULES = { lcp: { maxRatio: 1.25 }, tbt: { maxDelta: 150 } };
/** ON vs OFF in one run: prefetch is post-load, so any real difference is a regression. */
const PAIRED = { lcp: { maxDelta: 250 }, tbt: { maxDelta: 100 } };

/* ── Which requests are the effect's ───────────────────────────────────── */

const NAME_RE = /eversion|capture|modern-screenshot|(^|\/)worker[-.]|thurston|projection-lut/i;

/** Basenames of built chunks that contain eversion runtime modules. */
function eversionChunkNames() {
  const names = new Set();
  const assets = join(BUILD_DIR, 'assets');
  if (!existsSync(assets)) return { names, scanned: false };
  const files = readdirSync(assets).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const mapFile = join(assets, `${f}.map`);
    let hit = false;
    if (existsSync(mapFile)) {
      try {
        const { sources = [] } = JSON.parse(readFileSync(mapFile, 'utf8'));
        hit = EVERSION_RUNTIME_MODULES.some((m) => sources.some((s) => s.includes(m.fragment)));
      } catch {
        /* unreadable map: fall through to fingerprints */
      }
    } else {
      const text = readFileSync(join(assets, f), 'utf8');
      hit = EVERSION_RUNTIME_MODULES.some((m) => m.fingerprint && text.includes(m.fingerprint));
    }
    if (hit) names.add(f);
  }
  return { names, scanned: true };
}

const { names: CHUNKS, scanned } = eversionChunkNames();
const isEversionUrl = (url) => {
  const base = new URL(url).pathname.split('/').pop() ?? '';
  return CHUNKS.has(base) || NAME_RE.test(base);
};

/* ── One cold load ─────────────────────────────────────────────────────── */

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length
    ? s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : NaN;
};

async function coldLoad(browser, route, flagOn, settleMs) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__tasks = [];
    window.__fcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        if (e.name === 'first-contentful-paint') window.__fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__tasks.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  });
  const url = new URL(route, `${BASE_URL}/`);
  if (flagOn) url.searchParams.set('eversion', '1');
  const response = await page.goto(url.toString(), { waitUntil: 'load' });
  if (!response || !response.ok()) throw new Error(`${route}: HTTP ${response?.status()}`);
  // The hub warms at ~800 ms idle; give the prefetch (chunks + a software-GL compile) time to land.
  if (flagOn) {
    await page
      .waitForFunction(() => performance.getEntriesByName('eversion:prefetch').length > 0, null, {
        timeout: settleMs,
      })
      .catch(() => {});
  }
  await page.waitForTimeout(flagOn ? 2500 : 1500);

  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const loadStart = nav.loadEventStart;
    const tbt = (window.__tasks || [])
      .filter(([start]) => start >= window.__fcp && start < nav.loadEventEnd)
      .reduce((sum, [, dur]) => sum + Math.max(0, dur - 50), 0);
    return {
      loadStart,
      lcp: window.__lcp,
      tbt,
      resources: performance
        .getEntriesByType('resource')
        .map((r) => ({ url: r.name, start: r.startTime })),
      marks: performance
        .getEntriesByType('mark')
        .filter((m) => m.name.startsWith('eversion:'))
        .map((m) => ({ name: m.name, startTime: m.startTime })),
    };
  });
  await context.close();
  const ev = data.resources.filter((r) => isEversionUrl(r.url));
  return {
    lcp: data.lcp,
    tbt: data.tbt,
    before: ev.filter((r) => r.start < data.loadStart).map((r) => r.url),
    after: ev.filter((r) => r.start >= data.loadStart).map((r) => r.url),
    prefetchMark: data.marks.find((m) => m.name === EVERSION_MARKS.prefetch) ?? null,
    loadStart: data.loadStart,
    marks: data.marks,
  };
}

/* ── Negative control: a page whose `load` is late ─────────────────────── */

/** How long the stalled subresource holds `load` back. Comfortably past the hub's 800 ms warm. */
const LATE_LOAD_MS = 8000;
const SLOW_PATH = '/__late-load-probe.png';
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The hub warms its runtime on an 800 ms idle/timer race. If that race were what
 * released the effect's chunks, a page whose `load` takes longer than 800 ms would
 * fetch them BEFORE load. This holds `load` open (an image that answers late) well
 * past the warm and asserts: while `readyState` is not `complete` there are zero
 * eversion requests and no prefetch mark; once load fires the chunks do arrive
 * (so the control cannot pass by the warm-up simply being broken).
 */
async function lateLoadControl(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await context.route(`**${SLOW_PATH}`, async (route) => {
    await new Promise((r) => setTimeout(r, LATE_LOAD_MS));
    await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
  });
  await page.addInitScript((path) => {
    document.addEventListener('DOMContentLoaded', () => {
      const img = new Image();
      img.style.display = 'none';
      img.src = path;
      document.head.appendChild(img);
    });
  }, SLOW_PATH);
  const early = [];
  const stamp = Date.now();
  page.on('request', (r) => {
    if (isEversionUrl(r.url())) early.push({ url: r.url(), at: Date.now() - stamp });
  });
  const url = new URL('/', `${BASE_URL}/`);
  url.searchParams.set('eversion', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  // Well past the 800 ms warm and past hydration, still before the image answers.
  await page.waitForTimeout(LATE_LOAD_MS - 2500);
  const state = await page.evaluate(() => ({
    readyState: document.readyState,
    prefetchMarks: performance.getEntriesByName('eversion:prefetch').length,
  }));
  const beforeLoad = [...early];
  await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 30000 });
  await page
    .waitForFunction(() => performance.getEntriesByName('eversion:prefetch').length > 0, null, {
      timeout: 15000,
    })
    .catch(() => {});
  await page.waitForTimeout(1500);
  const afterLoad = early.length - beforeLoad.length;
  await context.close();
  return { state, beforeLoad, afterLoad };
}

/* ── Run ───────────────────────────────────────────────────────────────── */

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  [${ok ? 'ok  ' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function reachable() {
  try {
    const r = await fetch(BASE_URL, { redirect: 'manual' });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await reachable())) {
    console.error(
      `eversion-load: ${BASE_URL} is not reachable. Build and start the server first:\n` +
        '  pnpm run build:frontend:sourcemap && PORT=7005 node .output/server/index.mjs\n' +
        '  (needs DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL — see .env.example).',
    );
    return 2;
  }
  console.log(`\n  eversion load gate — ${BASE_URL}, ${RUNS} runs per case`);
  console.log(
    scanned
      ? `  identifying eversion chunks: ${CHUNKS.size} found in ${BUILD_DIR} (+ file-name match)`
      : `  WARNING: ${BUILD_DIR}/assets not readable — file-name match only`,
  );
  if (scanned && CHUNKS.size === 0) {
    check(
      'the build contains eversion chunks (positive control)',
      false,
      'none found — wrong BUILD_DIR, or prefetch is not wired',
    );
  }

  const browser = await launchBrowser();
  const current = {};
  const paired = [];
  try {
    for (const [route, hubMounted] of ROUTES) {
      console.log(`\n  ${route}  (${hubMounted ? 'site shell' : 'full-screen'})`);
      const off = [];
      const on = [];
      for (let i = 0; i < RUNS; i++) {
        off.push(await coldLoad(browser, route, false, 0));
        on.push(await coldLoad(browser, route, true, 12000));
      }
      const all = (rs, f) => rs.flatMap(f);

      check(
        'flag OFF: no eversion request, no prefetch mark',
        all(off, (r) => [...r.before, ...r.after]).length === 0 &&
          off.every((r) => !r.prefetchMark),
        all(off, (r) => [...r.before, ...r.after])[0] ?? '',
      );
      check(
        'flag ON: no eversion request before load',
        all(on, (r) => r.before).length === 0,
        all(on, (r) => r.before)[0] ?? '',
      );
      if (hubMounted) {
        check(
          'flag ON: prefetch mark present in every run',
          on.every((r) => r.prefetchMark),
        );
        check(
          'flag ON: prefetch mark is not before loadEventStart',
          on.every((r) => r.prefetchMark && r.prefetchMark.startTime >= r.loadStart),
          on
            .map((r) =>
              r.prefetchMark ? (r.prefetchMark.startTime - r.loadStart).toFixed(0) : '-',
            )
            .join(' / ') + ' ms after load',
        );
        if (scanned) {
          check(
            'flag ON: eversion chunks were fetched after load',
            on.every((r) => r.after.length > 0),
            `${on[0].after.length} requests`,
          );
        }
      } else {
        check(
          'full-screen route: no prefetch mark, no eversion request (flag ON)',
          on.every((r) => !r.prefetchMark && r.after.length === 0 && r.before.length === 0),
        );
      }

      current[`${route}:lcp`] = Math.round(median(off.map((r) => r.lcp)));
      current[`${route}:tbt`] = Math.round(median(off.map((r) => r.tbt)));
      const onLcp = Math.round(median(on.map((r) => r.lcp)));
      const onTbt = Math.round(median(on.map((r) => r.tbt)));
      console.log(
        `    median LCP ${current[`${route}:lcp`]} ms (flag on ${onLcp})   median TBT ${current[`${route}:tbt`]} ms (flag on ${onTbt})`,
      );
      paired.push({
        route,
        off: { lcp: current[`${route}:lcp`], tbt: current[`${route}:tbt`] },
        on: { lcp: onLcp, tbt: onTbt },
      });
    }

    console.log('\n  negative control: load event delayed ' + LATE_LOAD_MS + ' ms');
    try {
      const late = await lateLoadControl(browser);
      check(
        'delayed load: the page was still loading at the checkpoint (control is live)',
        late.state.readyState !== 'complete',
        late.state.readyState,
      );
      check(
        'delayed load: zero eversion requests before load',
        late.beforeLoad.length === 0,
        late.beforeLoad[0]?.url ?? '',
      );
      check('delayed load: no prefetch mark before load', late.state.prefetchMarks === 0);
      check('delayed load: the chunks DO arrive once load has fired', late.afterLoad > 0);
    } catch (error) {
      check('delayed-load control ran', false, String(error));
    }
  } finally {
    await browser.close();
  }

  console.log('\n  flag ON vs flag OFF, same run');
  for (const p of paired) {
    const cmp = compareToBaseline(p.on, p.off, PAIRED);
    check(`${p.route}: ON no worse than OFF`, cmp.ok, cmp.failures.join('; '));
  }

  const base = loadBaseline(BASELINE);
  if (wantsBaselineUpdate()) {
    const file = saveBaseline(BASELINE, current);
    console.log(`\n  ${base ? 'refreshed' : 'wrote'} ${file} (commit it)`);
  } else if (!base) {
    // A missing baseline is a FAILURE, in CI and locally alike: writing one from
    // the very run under test would make S#40 compare a build with itself.
    check(
      'a committed baseline exists (testing/e2e/baselines/eversion-load.json)',
      false,
      'none - run once with --update-baselines on a build you trust, and commit the file',
    );
  } else {
    console.log('\n  vs committed baseline');
    for (const [route] of ROUTES) {
      for (const metric of ['lcp', 'tbt']) {
        const key = `${route}:${metric}`;
        const cmp = compareToBaseline(
          { [metric]: current[key] },
          { [metric]: base[key] },
          { [metric]: RULES[metric] },
        );
        check(`${key} ${current[key]} ms (baseline ${base[key]})`, cmp.ok, cmp.failures.join('; '));
      }
    }
  }

  console.log(failures ? `\n  ${failures} check(s) FAILED\n` : '\n  all checks passed\n');
  return failures ? 1 : 0;
}

process.exit(await main());
