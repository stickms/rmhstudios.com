// ─────────────────────────────────────────────────────────────────────────────
// The frame-budget audit — does a page go IDLE, and how fast can it run?
//
// The question a high-refresh display asks of a page is not "is it 60fps?" but
// "how much of every frame is spent before the user does anything?". A page
// that holds even one perpetual animation is never idle: the compositor makes a
// new frame on every vsync for as long as the tab is open — 144 a second on a
// 144Hz panel, 240 on a 240Hz one — and every interaction frame has to fit
// around that. This drives the BUILT app in Chromium and measures exactly that.
//
//   pnpm build && PORT=7005 node .output/server/index.mjs
//
//   BASE_URL=http://localhost:7005 node testing/e2e/frame-budget.mjs           # default route set, desktop
//   … frame-budget.mjs --all                    # every page route (via the FOUC route collector)
//   … frame-budget.mjs --route / --route /games # specific routes
//   … frame-budget.mjs --profile mobile         # desktop | mobile | both
//   … frame-budget.mjs --json out.json          # machine-readable report
//   … frame-budget.mjs --gate                   # exit 1 if a site-shell page is not idle at rest
//   … frame-budget.mjs --settle 15000           # wait this long after load before measuring
//
// ## What it measures, per route
//
// 1. **Frames at rest** (`restFrames`). With the page loaded and untouched, how
//    many compositor frames per second does it produce on its own? Counted from
//    `DrawFrame` trace events with no probe running. A static page produces ~0.
// 2. **Browser CPU at rest** (`restCpu`). CPU time across EVERY Chromium process
//    (renderer, GPU — where SwiftShader raster and compositing land — browser,
//    utility), from /proc. This is what main-thread metrics never see: the
//    measurement that showed the site backdrop costing a full core while idle,
//    with the main thread essentially asleep. Linux-only; omitted elsewhere.
// 3. **Perpetual animations** (`infinite`). `document.getAnimations()` with
//    `iterations === Infinity`, named in the report so a regression points at
//    its selector.
// 4. **rAF cadence idle and while scrolling** (`idle`, `scroll`). Median/p95
//    frame interval and fps from a rAF probe, then the same while the document
//    (or its main scroller) is scrolled each frame.
//
// ## Reading the numbers
//
// Chromium runs vsync-capped (60Hz) because that is the only mode where frame
// timing reflects real draws: with the limiter off, headless Chromium skips
// presentation and rAF free-runs at hundreds of fps regardless of cost. On a
// container with no GPU, rendering is SwiftShader, which inflates raster and
// compositing cost — **absolute numbers are pessimistic; compare routes and
// builds against each other, not against a real device.** Frames at rest and
// perpetual-animation counts are hardware-independent and are what `--gate`
// checks. Findings and the measured before/after of the pass that introduced
// this tool: docs/performance-audit-2026-10-08.md.
// ─────────────────────────────────────────────────────────────────────────────

/* global innerHeight, performance, requestAnimationFrame -- referenced only inside
   page.evaluate() callbacks, which Playwright serialises and runs in the page. */
import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { collectRoutes } from './fouc-routes.mjs';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
/** Same resolution as fouc.mjs — see the note on CHROMIUM_PATH there. */
const CHROMIUM_PATH =
  process.env.FRAME_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

/** A site-shell page producing more frames than this per second at rest fails `--gate`. */
const REST_FRAME_LIMIT = 2;

/**
 * How long a page sits after `load` before anything is measured. `--gate` waits
 * past the site's BOUNDED animations — a 9s sheen sweep, three 2s
 * `animate-pulse-settle` pulses, page-enter transitions — because those are
 * designed to end, and the gate's question is whether the page is idle once they
 * have. Without `--gate` the short settle shows what a visitor sees in the first
 * seconds. `--settle <ms>` overrides either.
 */
const DEFAULT_SETTLE_MS = 2000;
const GATE_SETTLE_MS = 12000;
const REST_MS = 3000;
const TRACE_MS = 2000;
const IDLE_MS = 2000;
const SCROLL_MS = 2500;

/**
 * Default route set: every site-shell section the shell actually changes, and
 * every game/app landing page from the catalog. `--all` replaces it with the
 * full route tree.
 */
const DEFAULT_ROUTES = [
  '/', '/games', '/apps', '/pricing', '/news', '/library', '/leaderboard', '/achievements',
  '/market', '/store', '/events', '/communities', '/help', '/roadmap', '/services',
  '/predictions', '/homes', '/rideshare', '/rmhladder', '/study', '/search', '/developer',
  '/login', '/cookies', '/altair', '/bums-rush', '/cookgame', '/daily', '/dream-rift',
  '/dunesday', '/forest-explorer', '/gabriels-horn', '/house-always-wins', '/isleworks',
  '/kowloon-knockout', '/laundry-sort', '/massive-march', '/neon-driftway', '/nightrail',
  '/rmh-farming-sim', '/rmhbox', '/rochester-offensive', '/slice-it', '/synapse-storm',
  '/temple-of-joy', '/velum2099', '/versecraft', '/void-breaker', '/rmhcode', '/strategies',
];

const PROFILES = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  },
};

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const values = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const profileArg = values('--profile')[0] ?? 'desktop';
const profiles = profileArg === 'both' ? ['desktop', 'mobile'] : [profileArg];
const jsonOut = values('--json')[0];
const gate = flag('--gate');
const SETTLE_MS = Number(values('--settle')[0] ?? (gate ? GATE_SETTLE_MS : DEFAULT_SETTLE_MS));
let routes = values('--route');
if (flag('--all')) routes = collectRoutes().audited.map((r) => r.url);
if (routes.length === 0) routes = DEFAULT_ROUTES;

// ── measurement helpers ──────────────────────────────────────────────────────
const CLK_TCK_MS = 10;
/** CPU ms consumed so far by every process launched from our Chromium binary. */
function chromiumCpuMs(binary) {
  if (!existsSync('/proc')) return null;
  let total = 0;
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      if (!readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(binary)) continue;
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      total += (Number(f[11]) + Number(f[12])) * CLK_TCK_MS; // utime + stime
    } catch {
      /* process exited mid-read */
    }
  }
  return total;
}

function cadence(deltas) {
  if (deltas.length === 0) return null;
  const s = [...deltas].sort((a, b) => a - b);
  const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { fps: +(1000 / mean).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99) };
}

async function measure(browser, binary, route, profile) {
  const context = await browser.newContext({ ...PROFILES[profile], reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const result = { route, profile };
  try {
    const response = await page.goto(BASE_URL + route, { waitUntil: 'load', timeout: 45_000 });
    result.status = response?.status();
    await page.waitForTimeout(SETTLE_MS);

    const dom = await page.evaluate(() => {
      const describe = (a) => {
        const t = a.effect?.target;
        const name = a.animationName ?? a.constructor.name;
        const where = t?.nodeType === 1 ? `${t.tagName.toLowerCase()}.${String(t.className).split(' ')[0]}` : '?';
        return `${name} on ${where}${a.effect?.pseudoElement ?? ''}`;
      };
      return {
        siteShell: !!document.querySelector('.radial-shell'),
        nodes: document.getElementsByTagName('*').length,
        infinite: document
          .getAnimations()
          .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
          .map(describe),
      };
    });
    Object.assign(result, dom);

    const cpu0 = chromiumCpuMs(binary);
    await page.waitForTimeout(REST_MS);
    const cpu1 = chromiumCpuMs(binary);
    if (cpu0 !== null && cpu1 !== null) result.restCpuMsPerSec = Math.round((cpu1 - cpu0) / (REST_MS / 1000));

    await browser.startTracing(page, { categories: ['disabled-by-default-devtools.timeline.frame'] });
    await page.waitForTimeout(TRACE_MS);
    const trace = JSON.parse((await browser.stopTracing()).toString());
    const events = trace.traceEvents ?? trace;
    result.restFramesPerSec = events.filter((e) => e.name === 'DrawFrame').length / (TRACE_MS / 1000);

    const probe = await page.evaluate(
      ({ IDLE_MS, SCROLL_MS }) =>
        new Promise((resolve) => {
          const idle = [];
          const scroll = [];
          const doc = document.scrollingElement;
          const scroller =
            doc && doc.scrollHeight > innerHeight + 50
              ? doc
              : ([...document.querySelectorAll('main, .overflow-y-auto, .overflow-auto')].find(
                  (el) => el.scrollHeight > el.clientHeight + 50,
                ) ?? doc);
          let dir = 1;
          let last = performance.now();
          const start = last;
          const tick = (now) => {
            const d = now - last;
            last = now;
            const t = now - start;
            if (t < IDLE_MS) idle.push(d);
            else if (t < IDLE_MS + SCROLL_MS) {
              scroll.push(d);
              const max = scroller.scrollHeight - scroller.clientHeight;
              if (scroller.scrollTop >= max - 2) dir = -1;
              else if (scroller.scrollTop <= 0) dir = 1;
              scroller.scrollTop += dir * 8;
            } else return resolve({ idle: idle.slice(2), scroll: scroll.slice(2) });
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      { IDLE_MS, SCROLL_MS },
    );
    result.idle = cadence(probe.idle);
    result.scroll = cadence(probe.scroll);
  } catch (error) {
    result.error = String(error).slice(0, 300);
  }
  await context.close();
  return result;
}

// ── run ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] });
// The /proc filter needs a string that appears in every child's command line.
const binary = CHROMIUM_PATH ?? chromium.executablePath();

const results = [];
const failures = [];
for (const profile of profiles) {
  for (const route of routes) {
    const r = await measure(browser, binary, route, profile);
    results.push(r);
    const idleFail =
      r.siteShell && (r.restFramesPerSec > REST_FRAME_LIMIT || (r.infinite?.length ?? 0) > 0);
    if (idleFail) failures.push(r);
    console.log(
      `${idleFail ? '✗' : ' '} ${profile.padEnd(7)} ${route.padEnd(28)} ` +
        `rest ${String(r.restFramesPerSec ?? '—').padStart(5)} frames/s ${String(r.restCpuMsPerSec ?? '—').padStart(5)} cpu-ms/s · ` +
        `idle ${r.idle?.fps ?? '—'}fps · scroll ${r.scroll?.fps ?? '—'}fps p95 ${r.scroll?.p95 ?? '—'}ms` +
        (r.infinite?.length ? ` · ∞ ${r.infinite.slice(0, 3).join(', ')}${r.infinite.length > 3 ? ', …' : ''}` : '') +
        (r.error ? ` · ERROR ${r.error}` : ''),
    );
  }
}
await browser.close();

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
if (gate && failures.length > 0) {
  console.error(
    `\n${failures.length} site-shell page(s) are not idle at rest (> ${REST_FRAME_LIMIT} frames/s or a perpetual animation).` +
      `\nA page that never goes idle re-renders on every vsync — see docs/performance-audit-2026-10-08.md.`,
  );
  process.exit(1);
}
