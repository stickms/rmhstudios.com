// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion host, worker and core (T25) — headless Chromium acceptance.
//
//   node testing/e2e/eversion-host.mjs
//
//   CHROMIUM_PATH=/path/to/chrome node testing/e2e/eversion-host.mjs
//   (default: Playwright's own Chromium, else /opt/pw-browsers/chromium-*/chrome-linux/chrome)
//
// No dev server and no build: esbuild bundles a fixture page (the REAL
// `getEversionHost`) and a fixture worker entry (the REAL `bootWorker`, renderer
// with the real shaders, and the real `Timeline`), the page serves the worker
// as a Blob URL, and the fake origin is served through request interception.
// Only orientation and the LUT bake (other tasks) are stubbed — see
// testing/e2e/eversion-host/deps.ts. WebGL2 is SwiftShader.
//
// ## What it asserts (the T25 acceptance)
//
//  1. Worker mode is chosen where OffscreenCanvas exists; the `host` and
//     `renderer` debug slots register.
//  2. A full run emits every stage in order, `cover` once after the first frame,
//     `need-after-by`, and `done` with frame stats.
//  3. A 300 ms busy loop on the MAIN thread during EVERSION drops no worker
//     frames (the worker's own stats) — and the same busy loop DOES drop frames
//     in-thread, which proves the test could have failed.
//  4. No requestAnimationFrame is scheduled after `done` (a spy outside the
//     code under test, in the worker and on the main thread).
//  5. Hiding the page pauses the loop (no frames, no pending request, in the
//     worker too) and showing it resumes to `done`.
//  6. With OffscreenCanvas removed the in-thread path produces the same stage
//     sequence.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures = join(root, 'testing/e2e/eversion-host');

const STAGES = ['wrap', 'evert', 'gate-open', 'unwrap', 'uncover', 'reveal', 'done'];

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bundle(entry, format) {
  const out = await build({
    entryPoints: [join(fixtures, entry)],
    bundle: true,
    write: false,
    format,
    target: 'es2022',
    logLevel: 'error',
  });
  return out.outputFiles[0].text;
}

const workerSrc = await bundle('worker.ts', 'iife');
const pageSrc = await bundle('page.ts', 'esm');
const html = `<!doctype html><meta charset="utf-8"><title>eversion host</title><body style="margin:0">
<script>window.__WORKER_SRC__ = ${JSON.stringify(workerSrc)};</script>
<script type="module">${pageSrc.replaceAll('</script', '<\\/script')}</script>`;

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

async function openPage(initScript) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  if (initScript) await page.addInitScript(initScript);
  await page.route('http://eversion.test/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  await page.goto('http://eversion.test/?eversion-debug=1');
  await page.waitForFunction(() => window.__t);
  return { page, errors };
}

const t = (page, fn, ...args) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, args]);

try {
  /* ── Worker mode ─────────────────────────────────────────────────────── */
  const { page, errors } = await openPage();

  const s1 = await t(page, 'setup', null);
  check('worker mode where OffscreenCanvas exists', s1.mode === 'worker', s1.mode);
  check('worker answers init with ready', s1.ready);
  check(
    'registers the host and renderer debug slots',
    s1.slots.includes('host') && s1.slots.includes('renderer'),
    s1.slots.join(','),
  );

  // Baseline first: how many frames this (possibly loaded) machine drops with the main thread idle.
  const baseline = await page.evaluate(() => window.__t.run());
  console.log(`info  idle baseline: ${JSON.stringify(baseline.stats)}`);
  await t(page, 'setup', 'worker');
  const busyRun = await page.evaluate(() => window.__t.run({ busyAt: 1000, busyMs: 300 }));
  check(
    'full run reaches done without error',
    busyRun.stats !== null && !busyRun.error,
    busyRun.error ?? '',
  );
  check('every stage, in order, once', same(busyRun.stages, STAGES), busyRun.stages.join(' > '));
  const types = busyRun.types;
  check(
    'ready, need-after-by, cover (once) and done (last) are all present',
    types[0] === 'ready' &&
      types.includes('need-after-by') &&
      types.filter((x) => x === 'cover').length === 1 &&
      types.at(-1) === 'done',
    types.filter((x) => x !== 'stage').join(' '),
  );
  // `cover` is what turns the page's cover class on, and the class must go on AFTER the first frame has been
  // presented (an opaque canvas to hide behind) and BEFORE the effect has moved on: between the `wrap` stage
  // (emitted with the first tick) and the `evert` stage (600 ms in).
  const order = busyRun.order;
  const iWrap = order.indexOf('stage:wrap');
  const iCover = order.indexOf('cover');
  const iEvert = order.indexOf('stage:evert');
  check(
    'cover comes after the first frame (wrap) and before the second stage (evert)',
    iWrap > -1 && iCover > iWrap && iEvert > iCover,
    order.slice(0, 6).join(' > '),
  );
  check(
    'uncover is a message too, exactly once',
    types.filter((x) => x === 'uncover').length === 1,
  );
  check(
    'main thread really was blocked ~300 ms',
    busyRun.mainBlockedMs >= 290,
    `${busyRun.mainBlockedMs.toFixed(0)} ms`,
  );
  check('the run presented frames', busyRun.stats.frames >= 60, `${busyRun.stats.frames} frames`);
  const spy = await t(page, 'workerSpy');
  const [from, to] = busyRun.busyWindow;
  const inWindow = spy.times.filter((x) => x >= from && x <= to).length;
  check(
    'the worker kept presenting frames THROUGH the 300 ms main-thread busy loop',
    inWindow >= 3,
    `${inWindow} worker frames in the ${(to - from).toFixed(0)} ms window`,
  );
  // `dropped` is relative to the median, so a machine that is itself loaded (CI
  // neighbours, a shared dev box) drops frames with the main thread idle too. The
  // strict form applies whenever the idle baseline was clean.
  if (baseline.stats.dropped === 0) {
    check(
      'a 300 ms main-thread busy loop drops NO worker frames (stats)',
      busyRun.stats.dropped === 0,
      `dropped=${busyRun.stats.dropped} p95=${busyRun.stats.p95.toFixed(1)} ms`,
    );
  } else {
    console.log(
      `info  host is loaded (idle baseline dropped ${baseline.stats.dropped}); busy run dropped ${busyRun.stats.dropped}, p95 ${busyRun.stats.p95.toFixed(1)} ms - strict stats check skipped`,
    );
  }

  const hostDbg = await t(page, 'hostDebug');
  check(
    'host debug slot reports mode and the last stats',
    hostDbg?.mode === 'worker' && hostDbg.stats?.frames === busyRun.stats.frames,
  );

  const before = { raf: (await t(page, 'workerSpy')).count, loop: await t(page, 'loop') };
  await sleep(600);
  const after = { raf: (await t(page, 'workerSpy')).count, loop: await t(page, 'loop') };
  check(
    'no rAF is scheduled in the worker after done (spy count)',
    after.raf === before.raf && after.loop.pending === 0 && !after.loop.running,
    `${before.raf} -> ${after.raf}`,
  );
  check('host reports no pending frame at rest', (await t(page, 'hostDebug')).pending === 0);

  /* ── Hidden tab pauses ───────────────────────────────────────────────── */
  await t(page, 'setup', 'worker');
  await page.evaluate(() => {
    window.__p = window.__t.run();
  });
  // A fresh worker is probed, then builds its context: give a loaded machine up to 8 s to get frames out.
  let running = await t(page, 'loop');
  for (let i = 0; i < 80 && !(running.running && running.frames > 5); i++) {
    await sleep(100);
    running = await t(page, 'loop');
  }
  check(
    'loop is running before the tab is hidden',
    running.running && running.frames > 5,
    `${running.frames} frames`,
  );
  await t(page, 'setHidden', true);
  await sleep(150);
  const h1 = await t(page, 'loop');
  await sleep(700);
  const h2 = await t(page, 'loop');
  check(
    'hiding the tab pauses the worker loop (no frames, nothing pending)',
    h2.frames === h1.frames && h2.pending === 0 && h2.running && h2.hidden,
    `${h1.frames} -> ${h2.frames}`,
  );
  await t(page, 'setHidden', false);
  await sleep(300);
  const h3 = await t(page, 'loop');
  check('showing it resumes the loop', h3.frames > h2.frames, `${h2.frames} -> ${h3.frames}`);
  const resumed = await page.evaluate(() => window.__p);
  check(
    'the paused run still finishes, in order',
    resumed.stats !== null && same(resumed.stages, STAGES),
    resumed.error ?? '',
  );

  /* ── In-thread (forced) ──────────────────────────────────────────────── */
  const sMain = await t(page, 'setup', 'main');
  check('forcing main gives the in-thread host', sMain.mode === 'main');
  const rafBefore = await t(page, 'mainRaf');
  const mainRun = await page.evaluate(() => window.__t.run({ fastForward: true }));
  check(
    'in-thread run: same stage sequence',
    same(mainRun.stages, STAGES) && mainRun.stats !== null,
    mainRun.error ?? mainRun.stages.join(' > '),
  );
  const rafDone = await t(page, 'mainRaf');
  check(
    'in-thread loop requested frames while running',
    rafDone > rafBefore,
    `${rafDone - rafBefore}`,
  );
  await sleep(600);
  check(
    'no main-thread rAF is scheduled after done (spy count)',
    (await t(page, 'mainRaf')) === rafDone && (await t(page, 'hostDebug')).pending === 0,
  );

  await t(page, 'setup', 'main');
  await t(page, 'mainFrameTimes');
  const control = await page.evaluate(() => window.__t.run({ busyAt: 1000, busyMs: 300 }));
  const controlTimes = await t(page, 'mainFrameTimes');
  const [cFrom, cTo] = control.busyWindow;
  const controlInWindow = controlTimes.filter((x) => x >= cFrom && x <= cTo).length;
  check(
    'control: the same busy loop stops in-thread frames (so the test above could fail)',
    controlInWindow <= 1 && control.stats && control.stats.dropped >= 1,
    `${controlInWindow} in-thread frames in the window, dropped=${control.stats?.dropped}`,
  );

  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();

  /* ── OffscreenCanvas genuinely absent ────────────────────────────────── */
  const noOffscreen = await openPage(() => {
    delete window.OffscreenCanvas;
  });
  const sNo = await t(noOffscreen.page, 'setup', null);
  check('without OffscreenCanvas the detected mode is main', sNo.mode === 'main', sNo.mode);
  const noRun = await noOffscreen.page.evaluate(() => window.__t.run({ fastForward: true }));
  check(
    'in-thread (no OffscreenCanvas) emits the same stage sequence as the worker',
    same(noRun.stages, busyRun.stages) && noRun.stats !== null,
    noRun.error ?? '',
  );
  check(
    'no page errors (no OffscreenCanvas)',
    noOffscreen.errors.length === 0,
    noOffscreen.errors.join(' | '),
  );
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
