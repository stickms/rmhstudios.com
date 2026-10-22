// ─────────────────────────────────────────────────────────────────────────────
// The page-switch audit — how long does a click in the shell leave the page dead?
//
// A client navigation mounts the incoming page (and unmounts the outgoing one)
// inside one synchronous React commit, because TanStack Router publishes its
// matches through `useSyncExternalStore` and an external-store update is never
// time-sliced. This drives the BUILT app in Chromium and times exactly that:
// a real click on a nav-rail link, from a settled page, to the new page painted.
//
//   pnpm build:frontend && PORT=7005 node --env-file=.env .output/server/index.mjs
//
//   BASE_URL=http://localhost:7005 node testing/e2e/page-switch.mjs              # default pairs, 4× CPU
//   … page-switch.mjs --pair /games:/explore --pair /communities:/          # specific switches
//   … page-switch.mjs --pair '/>/communities:/'                             # start from a page reached in-visit
//   … page-switch.mjs --cpu 1 --rtt 0                                        # a desktop
//   … page-switch.mjs --mode hover                                           # pointer rests first (intent preload)
//   … page-switch.mjs --runs 5 --json out.json                               # more samples, machine-readable
//   … page-switch.mjs --trace /tmp/switch.json --pair /games:/explore        # one Chrome trace, for attribution
//   … page-switch.mjs --mode press                                           # a real tap: pointerdown, 90ms, click
//   … page-switch.mjs --cold                                                 # no unmeasured warm-up switch
//   … page-switch.mjs --kbps 1600                                            # throttle bandwidth (slow 4G ≈ 1600)
//
// ## What it measures, per switch
//
// - **paint** — click → the destination's URL is current, its top-of-page
//   marker is in the DOM, and the next frame has been produced. What the reader
//   sees: the moment the click visibly "took".
// - **complete** — click → every `DeferOnNavigate` placeholder has filled in.
//   Equal to `paint` on a page that defers nothing.
// - **maxFrame / blocking** — from the Long Animation Frames API over the whole
//   window: the longest single frame (the dead time a tap can land in) and the
//   summed `blockingDuration` (Lighthouse's TBT, for a switch).
// - **style** — of those frames, the time after `styleAndLayoutStart`: restyle
//   + layout, which is where a big page's teardown shows up.
//
// The click is dispatched with `el.click()` from inside the page, so by default
// no pointer hover precedes it: the TAP case (no intent preload from hover —
// though the shell's viewport prefetcher, which re-arms 1.2s after a page
// settles, has usually warmed an on-screen rail link already). `--mode hover` rests
// the pointer on the link for 600ms first, so the router's intent preload has
// the destination's code and loader data ready — then the whole page lands in
// the click's commit, which is the case `DeferOnNavigate` exists for. `--mode press`
// is the touch tap: a `pointerdown` on the link, the ~90ms a finger stays down,
// then the click — what a phone actually sends, and the only intent signal it
// has. Medians of `--runs`
// (default 3) are reported; the box is shared, so single runs vary ±30%.
// Absolute numbers are a lab's; compare builds against each other. Findings of
// the pass that introduced this tool: docs/performance-audit-2026-10-21.md
// §Navigation commit.
// ─────────────────────────────────────────────────────────────────────────────

/* global performance, requestAnimationFrame, PerformanceObserver, MutationObserver, PointerEvent, TouchEvent --
   referenced only inside page.evaluate() callbacks, which run in the page. */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:7005').replace(/\/$/, '');
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROMIUM_PATH =
  process.env.PAGE_SWITCH_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium')
    ? '/opt/pw-browsers/chromium'
    : existsSync(SYSTEM_CHROME)
      ? SYSTEM_CHROME
      : undefined);

/** The switches the 2026-10-09 and 2026-10-21 passes measured. */
const DEFAULT_PAIRS = [
  ['/communities', '/'],
  ['/communities', '/explore'],
  ['/communities', '/games'],
  ['/games', '/explore'],
  ['/games', '/communities'],
  ['/explore', '/'],
  // Back home within the visit: the feed store already holds the timeline.
  ['/>/communities', '/'],
];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const pairs = args.flatMap((a, i) => (args[i - 1] === '--pair' ? [a.split(':')] : []));
const PAIRS = pairs.length ? pairs : DEFAULT_PAIRS;
const RUNS = Number(flag('--runs', '3'));
const CPU = Number(flag('--cpu', '4'));
const RTT = Number(flag('--rtt', '100'));
const JSON_OUT = flag('--json', null);
const TRACE_OUT = flag('--trace', null);
const MODE = flag('--mode', 'tap');
const COLD = args.includes('--cold');
const KBPS = Number(flag('--kbps', '0'));
/** How long a finger stays down in `--mode press` (a typical tap is 60–120ms). */
const PRESS_MS = 90;
/** How long a page sits before the click (`--settle`, ms) — a reader's dwell. */
const SETTLE_MS = Number(flag('--settle', '2500'));

/**
 * Per-destination "the top of the page is there" marker. `/` has no visible
 * title (its h1 is sr-only) and its deck paints a skeleton before the feed, so
 * its marker is the first feed card; every PageLayout page has a visible h1.
 */
const MARKER = { '/': '.radial-wheel__slot' };
const MARKER_OVERRIDE = flag('--marker', null);
const markerFor = (path) => MARKER_OVERRIDE ?? MARKER[path] ?? 'main h1';

/**
 * `~card` as a destination: tap the first post card on the page (a feed or
 * profile list — the card is a `div` with a click handler, not a link, so it
 * gets no `<Link>` intent preload), and wait for the post page's header.
 */
const CARD = '~card';

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

/**
 * Load `path` and let it go quiet. `a>b` loads `a`, then switches to `b` in
 * the shell before settling — so the measured switch starts from a page reached
 * within the visit, with whatever `a` left in memory (`/>/communities` → `/` is
 * coming back to a feed the store already holds).
 */
async function settle(page, path) {
  const [first, ...rest] = path.split('>');
  await page.goto(`${BASE_URL}${first}`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  for (const next of rest) {
    await page.waitForTimeout(SETTLE_MS);
    await page.click(`a.rad-rail__item[href="${next}"]`);
    await page.waitForURL(`${BASE_URL}${next}`);
  }
  // Count only what the settled page fetches on its own from here on — the
  // speculative cost of a page view, not its own load.
  resetNet('settle');
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Network accounting, from CDP: every response's encoded bytes, bucketed by
 * phase. `settle` is everything a page view fetches on its own after load
 * (viewport/idle prefetch included) — the bandwidth and server cost of
 * speculation; `switch` is what the click itself had to fetch.
 */
const net = { phase: 'idle', settle: { reqs: 0, bytes: 0, data: 0 }, switch: { reqs: 0, bytes: 0, data: 0 } };
const isData = (url) => /\/_serverFn\/|\/api\//.test(url);
const reqUrl = new Map();
function trackNetwork(cdp) {
  cdp.on('Network.requestWillBeSent', (e) => reqUrl.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', (e) => {
    const bucket = net[net.phase];
    if (!bucket) return;
    bucket.reqs += 1;
    if (process.env.PAGE_SWITCH_NET_LOG && (net.phase === 'switch' || process.env.PAGE_SWITCH_NET_LOG === 'all')) console.log(`    [net:${net.phase}] ${reqUrl.get(e.requestId)?.replace(BASE_URL, '')} ${e.encodedDataLength}B`);
    bucket.bytes += e.encodedDataLength;
    if (isData(reqUrl.get(e.requestId) ?? '')) bucket.data += 1;
  });
}
const resetNet = (phase) => {
  net[phase] = { reqs: 0, bytes: 0, data: 0 };
  net.phase = phase;
};

async function switchOnce(page, from, to) {
  await settle(page, from);
  const settleNet = { ...net.settle };
  resetNet('switch');
  if (MODE === 'hover') {
    // Rest the pointer on the link first, so the router's intent preload (50ms
    // delay) fetches the destination's chunk and loader before the click.
    await page
      .hover(to === CARD ? 'main .social-post >> nth=0' : `a.rad-rail__item[href="${to}"]`)
      .catch(() => {});
    await page.waitForTimeout(600);
  }
  const result = await page.evaluate(
    async ({ to, marker, press, pressMs }) => {
      const frames = [];
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) frames.push(e);
      });
      po.observe({ type: 'long-animation-frame', buffered: false });
      // Layout shifts after the click: the deferred parts must fill in below the
      // fold without moving anything the reader can see.
      let cls = 0;
      const shifts = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
      });
      shifts.observe({ type: 'layout-shift', buffered: false });

      const isCard = to === '~card';
      const link = isCard
        ? [...document.querySelectorAll('main .social-post')].find((a) => a.offsetParent !== null)
        : (document.querySelector(`a.rad-rail__item[href="${to}"]`) ??
          [...document.querySelectorAll(`a[href="${to}"]`)].find((a) => a.offsetParent !== null));
      if (!link) return { error: `no visible link to ${to}` };
      const from = location.pathname;
      const arrived = () => (isCard ? location.pathname !== from && location.pathname.includes('/post/') : location.pathname === to);

      const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const until = async (pred, limit = 15000) => {
        const t = performance.now();
        while (!pred()) {
          if (performance.now() - t > limit) return false;
          await nextFrame();
        }
        return true;
      };

      const before = new Set(document.querySelectorAll(marker));
      // Loading states seen between the click and the destination's paint: the
      // router's pending skeleton (RoutePending) and any in-page spinner.
      let pendingSeen = 0;
      let spinnerSeen = 0;
      const pendingMo = new MutationObserver(() => {
        if (document.querySelector('[data-route-pending]')) pendingSeen += 1;
        if (document.querySelector('main [role="status"] .rad-loader, main .rad-loader')) spinnerSeen += 1;
      });
      pendingMo.observe(document.body, { childList: true, subtree: true });
      const t0 = performance.now();
      if (press) {
        // A touch tap: the pointer goes down on the link, stays ~90ms, lifts.
        const r = link.getBoundingClientRect();
        const at = { bubbles: true, cancelable: true, composed: true, clientX: r.left + 4, clientY: r.top + 4, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 };
        link.dispatchEvent(new PointerEvent('pointerdown', at));
        try {
          link.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, composed: true }));
        } catch {
          /* no TouchEvent constructor on this build — pointerdown carries it */
        }
        await new Promise((res) => setTimeout(res, pressMs));
        link.dispatchEvent(new PointerEvent('pointerup', { ...at, buttons: 0 }));
      }
      if (isCard) {
        // The card ignores clicks that land on a link or button inside it, so
        // click its text body, as a reader does.
        const body = link.querySelector('p') ?? link;
        body.click();
      } else link.click();
      // The outgoing page's own marker (its h1) is still mounted when the URL
      // flips, so only a marker element that did not exist before the click
      // counts as the destination having painted.
      const fresh = () => [...document.querySelectorAll(marker)].some((el) => !before.has(el));
      const painted = await until(() => arrived() && fresh());
      await nextFrame();
      const paint = performance.now() - t0;
      pendingMo.disconnect();
      await until(() => !document.querySelector('[data-slot="defer-placeholder"]'));
      await nextFrame();
      const complete = performance.now() - t0;
      // Let any trailing frame of the switch be reported.
      await new Promise((r) => setTimeout(r, 400));
      po.disconnect();
      shifts.disconnect();

      const inWindow = frames.filter((f) => f.startTime + f.duration >= t0);
      const styleOf = (f) =>
        f.styleAndLayoutStart ? f.startTime + f.duration - f.styleAndLayoutStart : 0;
      return {
        painted,
        paint,
        complete,
        maxFrame: Math.max(0, ...inWindow.map((f) => f.duration)),
        blocking: inWindow.reduce((s, f) => s + (f.blockingDuration ?? 0), 0),
        style: inWindow.reduce((s, f) => s + styleOf(f), 0),
        cls,
        pending: pendingSeen > 0 ? 1 : 0,
        spinner: spinnerSeen > 0 ? 1 : 0,
        elements: document.getElementsByTagName('*').length,
      };
    },
    { to, marker: markerFor(to), press: MODE === 'press', pressMs: PRESS_MS },
  );
  net.phase = 'idle';
  return { ...result, settleReqs: settleNet.reqs, settleKB: settleNet.bytes / 1024, settleData: settleNet.data, switchReqs: net.switch.reqs, switchKB: net.switch.bytes / 1024, switchData: net.switch.data };
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });

/** A page with the run's CPU/network throttling and the byte accounting. */
async function openPage() {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('Network.enable');
  trackNetwork(cdp);
  if (RTT > 0 || KBPS > 0) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: RTT,
      downloadThroughput: KBPS > 0 ? (KBPS * 1024) / 8 : -1,
      uploadThroughput: KBPS > 0 ? (KBPS * 1024) / 16 : -1,
    });
  }
  return { context, page };
}

// Warm runs reuse one page, so its HTTP and memory caches carry over between
// samples the way they do within a visit. Cold runs open a fresh context per
// sample: `Network.clearBrowserCache` leaves the renderer's memory cache alone,
// so it is not cold.
let { page } = await openPage();

console.log(
  `page-switch: ${BASE_URL} · ${CPU}× CPU · ${RTT}ms RTT${KBPS ? ` · ${KBPS}kbps` : ''} · ${RUNS} runs · ${MODE}${COLD ? ' · cold' : ''}\n`,
);
const rows = [];

if (TRACE_OUT) {
  const [from, to] = PAIRS[0];
  await settle(page, from);
  await browser.startTracing(page, {
    path: TRACE_OUT,
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'v8.execute',
      'blink',
    ],
  });
  const r = await switchOnce(page, from, to).catch((e) => ({ error: String(e) }));
  await browser.stopTracing();
  console.log(`${from} → ${to}`, r, `\ntrace written to ${TRACE_OUT}`);
} else {
  for (const [from, to] of PAIRS) {
    // One unmeasured switch first, so the destination's chunk and CSS are in
    // the HTTP cache the way they are for a reader on their second visit.
    if (!COLD) await switchOnce(page, from, to).catch(() => {});
    const samples = [];
    for (let i = 0; i < RUNS; i++) {
      // Cold: a fresh HTTP cache per sample, so the destination's chunk and
      // data come over the wire unless the page view itself prefetched them.
      if (COLD) {
        await page.context().close();
        ({ page } = await openPage());
      }
      const r = await switchOnce(page, from, to).catch((e) => ({ error: String(e) }));
      if (r.error || !r.painted) {
        console.warn(`  ${from} → ${to}: ${r.error ?? 'never painted'}`);
        continue;
      }
      samples.push(r);
    }
    const pick = (k) => Math.round(median(samples.map((s) => s[k])));
    const row = {
      from,
      to,
      runs: samples.length,
      paint: pick('paint'),
      complete: pick('complete'),
      maxFrame: pick('maxFrame'),
      blocking: pick('blocking'),
      style: pick('style'),
      cls: Number(median(samples.map((s) => s.cls)).toFixed(3)),
      elements: pick('elements'),
      // How many of the samples showed a loading state before the paint.
      pending: samples.reduce((n, x) => n + (x.pending ?? 0), 0),
      spinner: samples.reduce((n, x) => n + (x.spinner ?? 0), 0),
      switchReqs: pick('switchReqs'),
      switchKB: pick('switchKB'),
      switchData: pick('switchData'),
      settleReqs: pick('settleReqs'),
      settleKB: pick('settleKB'),
      settleData: pick('settleData'),
    };
    rows.push(row);
    console.log(
      `${`${from} → ${to}`.padEnd(28)} paint ${String(row.paint).padStart(5)}ms · complete ${String(row.complete).padStart(5)}ms · max frame ${String(row.maxFrame).padStart(4)}ms · blocking ${String(row.blocking).padStart(4)}ms · style+layout ${String(row.style).padStart(4)}ms · CLS ${row.cls} · skeleton ${row.pending}/${row.runs} spinner ${row.spinner}/${row.runs} · click fetched ${row.switchReqs} req/${row.switchKB}KB (${row.switchData} data) · page view ${row.settleReqs} req/${row.settleKB}KB (${row.settleData} data)`,
    );
  }
}

if (JSON_OUT)
  writeFileSync(JSON_OUT, JSON.stringify({ cpu: CPU, rtt: RTT, runs: RUNS, rows }, null, 2));
await browser.close();
