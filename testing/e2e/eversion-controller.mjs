// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion run orchestration (T31) — headless Chromium acceptance.
//
//   node testing/e2e/eversion-controller.mjs
//
//   CHROMIUM_PATH=/path/to/chrome node testing/e2e/eversion-controller.mjs
//   (default: Playwright's own Chromium, else /opt/pw-browsers/chromium-*/chrome-linux/chrome)
//
// No dev server and no build, like `eversion-host.mjs`: esbuild bundles a
// fixture page (testing/e2e/eversion-controller/page.ts) around the REAL
// controller module, runner, host (worker mode, canvas transferred), renderer
// (real shaders) and timeline; the fake origin is served by request
// interception. Faked: the router (history-backed, renders a route into #page
// after 120 ms), the BEFORE scheduler and capture session (T17 may not have
// landed), orientation (T13) and the LUT bake (T07) via eversion-host/deps.ts.
// WebGL2 is SwiftShader. Takes about 25 s.
//
// Why a fixture and not the app's dev server: the app's SSR dev worker does not
// start in a git worktree that borrows another checkout's node_modules, and the
// controller's contract is with the router and the host, not with any one page.
// The fake router mirrors the two TanStack behaviours the controller relies on:
// `navigate` changes the URL synchronously, and its promise resolves when the
// route has rendered. When T32 wires the hub, the hub e2e (T34) covers the app.
//
// ## What it asserts (the T31 acceptance; the order amended 2026-10-19)
//
//  1. On three routes: marks in order start, cover, evert, gate-open, unwrap,
//     reveal, done; each with its `detail`.
//  2. The destination is rendered BEFORE the animation: the URL changes, the
//     route renders and AFTER is captured, all before the `start` mark - and the
//     globe therefore shows the real destination from its first frame.
//  3. A frozen picture (`.eversion-hold`) is up before the navigation, is raised
//     over the canvas before `start`, starts its fade only once the first frame is
//     on screen (the `cover` mark), and is gone after `done`.
//  4. `html.eversion-cover` is on from the navigation (the shell is hidden under
//     the picture) until UNWRAP's tail, off before `reveal`.
//  5. The overlay element exists during the run and is gone after `done`;
//     `data-eversion-settle` and the cover class are gone too.
//  6. AFTER is captured with `data-eversion-settle` set.
//  7. Fast-forward completes within 650 ms + the reveal fade (+ scheduling slack) of the
//     key press.
//  8. An injected BEFORE failure still plays: the release takes a capture on demand.
//  9. An injected AFTER failure navigates and ends WITHOUT animating (`abort`, no
//     `start` mark): there is no picture of the destination to put on the globe.
// 10. The `controller` debug slot registers and, with no capture library here,
//     resolves (as a fallback) rather than throwing.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures = join(root, 'testing/e2e/eversion-controller');

const MARKS = ['start', 'cover', 'evert', 'gate-open', 'unwrap', 'reveal', 'done'].map(
  (n) => `eversion:${n}`,
);
const REVEAL_MS = 200;
const FF_REMAINING_MS = 650;
const FF_SLACK_MS = 400; // SwiftShader frames + the key's trip to the worker

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync(chromium.executablePath())) return undefined;
  const base = '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((n) => /^chromium-?\d*$/.test(n))) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = join(base, d, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

async function bundle(entry, format) {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format,
    target: 'es2022',
    logLevel: 'error',
    alias: { '@': root },
    define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.css': 'empty' },
  });
  return out.outputFiles[0].text;
}

const workerSrc = await bundle(join(root, 'testing/e2e/eversion-host/worker.ts'), 'iife');
const pageSrc = await bundle(join(fixtures, 'page.ts'), 'esm');
const html = `<!doctype html><meta charset="utf-8"><title>eversion controller</title>
<link rel="stylesheet" href="/eversion.css">
<body style="margin:0"><div id="page" style="padding:24px">route /</div>
<script>window.__WORKER_SRC__ = ${JSON.stringify(workerSrc)};</script>
<script type="module">${pageSrc.replaceAll('</script', '<\\/script')}</script>`;
const css = readFileSync(join(root, 'components/radial/eversion/eversion.css'), 'utf8');

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route('http://eversion.test/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/eversion.css') {
      return r.fulfill({ status: 200, contentType: 'text/css', body: css });
    }
    return r.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
  await page.goto('http://eversion.test/?eversion=1&eversion-debug=1');
  await page.waitForFunction(() => window.__t);

  const setup = await page.evaluate(() => window.__t.setup());
  check(
    'registers the controller debug slot',
    setup.slots.includes('controller'),
    setup.slots.join(','),
  );

  const t = (fn, ...args) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, args]);
  const at = (run, name) => run.marks.find((m) => m.name === name)?.at;

  function assertRun(label, run, { ff }) {
    const names = run.marks.map((m) => m.name);
    check(
      `${label}: resolved as a run, not a fallback`,
      run.outcome.fallback === null,
      JSON.stringify(run.outcome),
    );
    check(`${label}: outcome.end is done`, run.outcome.end === 'done', String(run.outcome.end));
    check(
      `${label}: marks arrive in order`,
      JSON.stringify(names) === JSON.stringify(MARKS),
      names.join(' > '),
    );

    const start = run.marks.find((m) => m.name === 'eversion:start');
    check(
      `${label}: start detail carries projection, tier, host, href, entry`,
      Boolean(start?.detail?.projection) &&
        Boolean(start.detail.tier) &&
        start.detail.host === 'worker' &&
        start.detail.href === label &&
        start.detail.entry === 'click',
      JSON.stringify(start?.detail),
    );
    const doneMark = run.marks.find((m) => m.name === 'eversion:done');
    check(
      `${label}: done carries frame stats and end`,
      doneMark?.detail?.frames > 0 && doneMark.detail.end === 'done',
      JSON.stringify(doneMark?.detail),
    );

    // The destination first: navigate, the route renders, AFTER is captured - all before `start`.
    const nav = run.trace.find((x) => x.what === 'navigate');
    const rendered = run.trace.find((x) => x.what === 'route-rendered');
    const startAt = at(run, 'eversion:start');
    check(
      `${label}: the URL changes before the animation starts (navigate ${(startAt - nav.at).toFixed(0)} ms before the start mark)`,
      Boolean(nav) && nav.at < startAt,
    );
    check(
      `${label}: AFTER is captured before the start mark, after the route rendered`,
      run.captureSeen.length === 1 &&
        Boolean(rendered) &&
        run.captureSeen[0].at >= rendered.at &&
        run.captureSeen[0].at < startAt,
      JSON.stringify({ captured: run.captureSeen[0]?.at, rendered: rendered?.at, startAt }),
    );
    check(
      `${label}: the URL is the destination afterwards`,
      run.pathAfter === label,
      run.pathAfter,
    );

    // The frozen picture: up before the navigation, dropped only once the first frame is on screen (it is
    // replaced by that frame, the same page: amended 2026-10-19, it used to fade with `--out`).
    const holdOn = run.trace.find((x) => x.what === 'hold-on');
    const holdOut = run.trace.find(
      (x) => x.what === 'hold-none' && x.at >= (run.trace.find((y) => y.what === 'hold-up')?.at ?? Infinity),
    );
    check(
      `${label}: the frozen picture is up before the navigation`,
      Boolean(holdOn) && holdOn.at <= nav.at,
    );
    const holdUp = run.trace.find((x) => x.what === 'hold-up');
    check(
      `${label}: ...is raised over the canvas after AFTER is captured, before the start mark`,
      Boolean(holdUp) && holdUp.at >= run.captureSeen[0].at && holdUp.at <= startAt,
      `${holdUp ? (startAt - holdUp.at).toFixed(1) : '-'} ms before start`,
    );
    check(
      `${label}: ...and is dropped only once the first frame is on screen (the cover mark)`,
      Boolean(holdOut) && holdOut.at >= at(run, 'eversion:cover') - 1,
      `${holdOut ? (holdOut.at - at(run, 'eversion:cover')).toFixed(1) : '-'} ms`,
    );
    check(`${label}: the frozen picture is gone after done`, !run.holdAfter);

    // Cover window: from the navigation (under the picture) to UNWRAP's tail.
    const on = run.trace.filter((x) => x.what === 'cover-class-on');
    const off = run.trace.filter((x) => x.what === 'cover-class-off');
    check(
      `${label}: cover class turned on once and off once`,
      on.length === 1 && off.length === 1,
      `${on.length}/${off.length}`,
    );
    if (on.length && off.length) {
      check(
        `${label}: cover class on by the navigation, under the picture`,
        on[0].at <= nav.at + 1 && on[0].at >= holdOn.at,
        `${(on[0].at - nav.at).toFixed(1)} ms`,
      );
      check(
        `${label}: cover class off before reveal, after unwrap`,
        off[0].at <= at(run, 'eversion:reveal') && off[0].at >= at(run, 'eversion:unwrap'),
        `unwrap ${at(run, 'eversion:unwrap').toFixed(0)} off ${off[0].at.toFixed(0)} reveal ${at(run, 'eversion:reveal').toFixed(0)}`,
      );
    }
    check(
      `${label}: no cover class, settle attribute or overlay after done`,
      !run.coverAfter && !run.settleAfter && !run.overlayAfter,
    );
    check(`${label}: the overlay existed during the run`, run.overlaySeen > 0);
    check(
      `${label}: AFTER captured with data-eversion-settle set`,
      run.captureSeen.length === 1 && run.captureSeen[0].settle,
      JSON.stringify(run.captureSeen),
    );
    check(
      `${label}: controller is done and idle of cover`,
      run.state.phase === 'done' && !run.state.coverActive,
    );

    if (ff) {
      // The timeline clamps each frame's dt to MAX_DT (50 ms), so on a host that
      // renders a frame every 600 ms (SwiftShader on a shared box) a 650 ms
      // remainder legitimately takes ~12x longer in wall time. Scale the bound by
      // the run's own p95 frame time; on a healthy host the factor is 1.
      const slow = Math.max(1, (doneMark?.detail?.p95 ?? 0) / 50);
      const bound = (FF_REMAINING_MS + REVEAL_MS + FF_SLACK_MS) * slow;
      const took = at(run, 'eversion:done') - run.ffAt;
      check(
        `${label}: fast-forward finished ${took.toFixed(0)} ms after the harness hurry (bound ${bound.toFixed(0)} = (650 + reveal + slack) x ${slow.toFixed(1)} frame-time factor)`,
        took <= bound,
      );
    }
  }

  /* Full-length run on the first route (the only one that plays out in real time). */
  assertRun('/games', await t('run', '/games'), { ff: false });
  /* Fast-forward on the other two: same controller, same persistent canvas. */
  assertRun('/apps', await t('run', '/apps', { ffAfterCoverMs: 400 }), { ff: true });
  assertRun('/about', await t('run', '/about', { ffAfterCoverMs: 400 }), { ff: true });

  /* AFTER failure: the page is navigated to, and the run ends without animating. */
  await t('inject', { after: 'throw' });
  const failedAfter = await t('run', '/library');
  check(
    'AFTER failure: ends as abort, with the overlay, picture and cover gone',
    failedAfter.outcome.fallback === null &&
      failedAfter.outcome.end === 'abort' &&
      !failedAfter.overlayAfter &&
      !failedAfter.holdAfter &&
      !failedAfter.coverAfter &&
      !failedAfter.settleAfter,
    JSON.stringify(failedAfter.outcome),
  );
  check(
    'AFTER failure: nothing was animated (no start mark) and the URL is the destination',
    !failedAfter.marks.some((m) => m.name === 'eversion:start') &&
      failedAfter.pathAfter === '/library',
    `${failedAfter.marks.map((m) => m.name).join(',')} ${failedAfter.pathAfter}`,
  );
  await t('inject', { after: 'ok' });

  /* BEFORE failure: the effect still plays, from a capture taken on demand (amended 2026-10-18). */
  await t('inject', { before: 'missing' });
  const before = await t('run', '/never');
  check(
    'BEFORE failure: the run still plays and ends in done',
    before.outcome.fallback === null && before.outcome.end === 'done',
    JSON.stringify(before.outcome),
  );
  check(
    'BEFORE failure: every mark, in order',
    MARKS.every((m) => before.marks.some((x) => x.name === m)),
    before.marks.map((m) => m.name).join(','),
  );
  check(
    'BEFORE failure: the controller navigated',
    before.pathAfter === '/never',
    before.pathAfter,
  );
  check('BEFORE failure: the cover class is gone at the end', !before.coverAfter);
  await t('inject', { before: 'ok' });

  /* Debug slot: no capture library in this page, so it falls back, without throwing. */
  const dbg = await t('debugSlot');
  check(
    'debug slot startTo resolves (a fallback: no capture library in this page) without throwing',
    dbg && (dbg.outcome.fallback === null || typeof dbg.outcome.fallback === 'string'),
    JSON.stringify(dbg?.outcome),
  );

  check('no page errors or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
