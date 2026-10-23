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
//   … frame-budget.mjs --gate                   # exit 1 if a site-shell page is not at its resting cadence
//   … frame-budget.mjs --gate --engaged         # same, but with a pointer moving: the engaged ceiling
//   … frame-budget.mjs --settle 15000           # wait this long after load before measuring
//   … frame-budget.mjs --jelly-motion still     # store a jellyMotion preference (lively | calm | still) first
//   … frame-budget.mjs --electric-arcs off      # store an electricArcs preference (full | clicks | off) first
//   FRAME_GPU=1 … frame-budget.mjs              # real GPU, not SwiftShader (3D routes need it)
//
// ## What it measures, per route
//
// 1. **Frames at rest** (`restFrames`). With the page loaded and untouched, how
//    many compositor frames per second does it produce on its own? Counted from
//    `DrawFrame` trace events with no probe running. A static page produces ~0.
// 2. **Browser CPU at rest** (`restCpu`). CPU time across EVERY Chromium process
//    (renderer, GPU — where SwiftShader raster and compositing land — browser,
//    utility). This is what main-thread metrics never see: the
//    measurement that showed the site backdrop costing a full core while idle,
//    with the main thread essentially asleep. From /proc on Linux; elsewhere
//    from CDP `SystemInfo.getProcessInfo` (this browser's processes only).
//    Split by source: `arcFrames` is how many of those frames the ambient arc
//    layer drew in (a Canvas2D hook, not a frame probe), and `clockFrames` is
//    the same trace taken again with `html[data-electric-arcs="clicks"]` —
//    the jelly clock and everything else, with ambient arcs isolated.
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
//
// ## What `--gate` fails, and what it SKIPs (GPU-less runners)
//
// Deterministic, failed everywhere: a site-shell page whose CLOCK frames
// (ambient arcs isolated, see below) are above the rest (or engaged) cadence,
// an unsanctioned perpetual animation, and a route that could
// not be measured at all (navigation error or a 5xx) — an unmeasured page is
// never a pass. GPU-only, judged only on hardware GL: R7 "never freezes" (a
// site-shell page with visible haze must draw > 0 frames at rest). Under
// SwiftShader / llvmpipe (testing/e2e/lib/gpu.mjs) the jelly governor
// legitimately steps the clock to 0, so that check prints `SKIP` per route and
// in the summary instead of passing silently. `JELLY_ASSUME_GPU=1|0` overrides
// the detection.
//
// ## Why the cadence gate isolates ambient arcs
//
// Ambient arcs are a separate, separately budgeted ambient source (≤ 1 per 2 s,
// `ARC_BUDGET` in lib/jelly/arcs/rate.ts, gated by N1 in
// lib/__tests__/jelly-contract.test.ts). They keep striking at rest, by design,
// and each one is drawn at the display rate for its ~120–380 ms life: up to ~11
// frames a second on a page dense with close cards (/games, /apps), on top of
// the 12 Hz clock. The R7 rest limit (idle floor + 1) is the CLOCK's budget, so
// the gate judges `clockFrames` (the same isolation jelly-interaction.mjs uses
// for its frame checks) and reports `arcFrames` next to it. CI run 39954731013
// failed 8 routes at 14–21 frames/s on the undivided count. `--electric-arcs`
// on the command line measures that preference as stored and skips the split.
// ─────────────────────────────────────────────────────────────────────────────

/* global innerHeight, performance, requestAnimationFrame -- referenced only inside
   page.evaluate() callbacks, which Playwright serialises and runs in the page. */
import { chromium } from 'playwright';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { collectRoutes } from './fouc-routes.mjs';
import { annotateSkip, describeRenderer, probeRenderer } from './lib/gpu.mjs';
import { IDLE_AFTER_MS, JELLY_BUDGETS } from '../../lib/jelly/tiers.ts';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
/** Same resolution as fouc.mjs — see the note on CHROMIUM_PATH there. */
const CHROMIUM_PATH =
  process.env.FRAME_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

/**
 * A site-shell page producing more frames than this per second at rest fails `--gate`.
 *
 * Plasmatic Jelly R7 (docs/plans/plasmatic-jelly/00-master-plan.md, owner decision 2026-10-23): the material
 * ALWAYS has underlying motion, so a visible page never reaches 0 frames. After `IDLE_AFTER_MS` without input the
 * ambient clock drops to the tier's idle floor (`JELLY_BUDGETS[tier].idleClockHz`, 12 Hz on desktop) and stays
 * there; it is 0 only when the tab is hidden, the window unfocused, nothing jelly is on screen, the tier is degraded
 * or `jellyMotion = still`. The rest limit is therefore that floor + 1 frame of slack (13 fps) — a DELIBERATE
 * reversal of the 2026-10-08 audit's 2 fps rest limit (docs/performance-audit-2026-10-08.md), recorded in the
 * jelly contract (docs/plasmatic-jelly-system.md). Both numbers come from `lib/jelly/tiers.ts`; never restate them
 * here. The CPU target at rest on `/` stays ≤ 250 ms/s (04 §3.5, advisory — reported, not gated).
 */
const IDLE_FLOOR_HZ = Math.max(...Object.values(JELLY_BUDGETS).map((b) => b.idleClockHz));
const REST_FRAME_LIMIT = IDLE_FLOOR_HZ + 1;
/** `--engaged`: someone is moving the pointer, so the clock runs at the tier's engaged rate (30 Hz) + 5 of slack. */
const ENGAGED_FRAME_LIMIT = Math.max(...Object.values(JELLY_BUDGETS).map((b) => b.clockHz)) + 5;
/** Advisory browser-CPU budget at rest on `/` (04 §3.5); printed next to the cadence, never gated. */
const REST_CPU_TARGET_MS = 250;
/**
 * The only perpetual animations a site page may hold: the CSS flow carriers' two keyframes, and only on spans inside
 * `.jelly-flow` (site-infinite-animation.test.ts N3 sanctions exactly these). They are owned by
 * `lib/jelly/flow-carriers.ts`, which removes them under every non-ambient state.
 */
const SANCTIONED_INFINITE = new Set(['jelly-drift', 'jelly-current']);

/**
 * How long a page sits after `load` before anything is measured. `--gate` waits
 * past the site's BOUNDED animations — a 9s sheen sweep, three 2s
 * `animate-pulse-settle` pulses, page-enter transitions — because those are
 * designed to end, and the gate's question is whether the page is idle once they
 * have. Without `--gate` the short settle shows what a visitor sees in the first
 * seconds. `--settle <ms>` overrides either.
 */
const DEFAULT_SETTLE_MS = 2000;
// Past the bounded animations AND past the jelly idle threshold, so `rest` means "on the idle floor" (R7).
const GATE_SETTLE_MS = Math.max(12000, IDLE_AFTER_MS + 3000);
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
/** `--jelly-motion <lively|calm|still>`: stored in `rmh-jelly-motion` before load, as the settings row would. */
const jellyMotion = values('--jelly-motion')[0];
/** `--electric-arcs <full|clicks|off>`: stored in `rmh-electric-arcs` before load; turns off the arcs/clock split. */
const electricArcs = values('--electric-arcs')[0];
const gate = flag('--gate');
const engaged = flag('--engaged');
const FRAME_LIMIT = engaged ? ENGAGED_FRAME_LIMIT : REST_FRAME_LIMIT;
const SETTLE_MS = Number(
  values('--settle')[0] ?? (gate && !engaged ? GATE_SETTLE_MS : DEFAULT_SETTLE_MS),
);
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

/**
 * The same total where there is no /proc (macOS, Windows), from the browser
 * itself: `SystemInfo.getProcessInfo` lists every process of THIS browser
 * instance with its cumulative CPU time, so neither a desktop Chrome nor a
 * second Playwright run on the same machine leaks into the number.
 */
async function cdpCpuMs(cdp) {
  try {
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
    return processInfo.reduce((sum, p) => sum + p.cpuTime * 1000, 0);
  } catch {
    return null;
  }
}

function cadence(deltas) {
  if (deltas.length === 0) return null;
  const s = [...deltas].sort((a, b) => a - b);
  const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { fps: +(1000 / mean).toFixed(1), p50: q(0.5), p95: q(0.95), p99: q(0.99) };
}

async function measure(browser, cdp, binary, route, profile) {
  const context = await browser.newContext({ ...PROFILES[profile], reducedMotion: 'no-preference' });
  if (jellyMotion)
    await context.addInitScript((v) => {
      try {
        window.localStorage.setItem('rmh-jelly-motion', v);
      } catch {
        /* storage blocked: measured as the default */
      }
    }, jellyMotion);
  if (electricArcs)
    await context.addInitScript((v) => {
      try {
        window.localStorage.setItem('rmh-electric-arcs', v);
      } catch {
        /* storage blocked: measured as the default */
      }
    }, electricArcs);
  // Which frames the ambient arc layer drew in: a hook on its Canvas2D clear (the renderer clears its dirty box on
  // every frame an arc is alive), keyed by the frame's timeline time. Off until `__arcCount` is set; it never
  // requests a frame.
  await context.addInitScript(() => {
    const proto = window.CanvasRenderingContext2D?.prototype;
    if (!proto) return;
    const clear = proto.clearRect;
    window.__arcFrames = new Set();
    proto.clearRect = function (...args) {
      if (window.__arcCount && this.canvas?.classList?.contains('jelly-arc-layer'))
        window.__arcFrames.add(document.timeline.currentTime);
      return clear.apply(this, args);
    };
  });
  const page = await context.newPage();
  const result = {
    route,
    profile,
    ...(jellyMotion ? { jellyMotion } : {}),
    ...(electricArcs ? { electricArcs } : {}),
  };
  try {
    const response = await page.goto(BASE_URL + route, { waitUntil: 'load', timeout: 45_000 });
    result.status = response?.status();
    await page.waitForTimeout(SETTLE_MS);

    const dom = await page.evaluate((sanctionedNames) => {
      const describe = (a) => {
        const t = a.effect?.target;
        const name = a.animationName ?? a.constructor.name;
        const where = t?.nodeType === 1 ? `${t.tagName.toLowerCase()}.${String(t.className).split(' ')[0]}` : '?';
        return `${name} on ${where}${a.effect?.pseudoElement ?? ''}`;
      };
      const running = document
        .getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity);
      const sanctioned = (a) =>
        sanctionedNames.includes(a.animationName) && !!a.effect?.target?.closest?.('.jelly-flow');
      return {
        siteShell: !!document.querySelector('.radial-shell'),
        nodes: document.getElementsByTagName('*').length,
        infinite: running.filter((a) => !sanctioned(a)).map(describe),
        jellyCarriers: running.filter(sanctioned).length,
        hazeCanvases: document.querySelectorAll('.jelly-haze-canvas').length,
      };
    }, [...SANCTIONED_INFINITE]);
    Object.assign(result, dom);

    // `--engaged`: a pointer sweeping the viewport for the whole measured window (input keeps the clock engaged).
    let sweeping = engaged;
    const sweep = (async () => {
      const { width, height } = page.viewportSize() ?? PROFILES[profile].viewport;
      for (let i = 0; sweeping; i++) {
        const t = i / 40;
        const x = width * (0.2 + 0.6 * ((Math.sin(t) + 1) / 2));
        const y = height * (0.3 + 0.4 * ((Math.cos(t * 0.7) + 1) / 2));
        await page.mouse.move(x, y);
        await page.waitForTimeout(50);
      }
    })().catch(() => {
      sweeping = false; // the page closed under us; the error is reported by the outer catch
    });
    const stopSweep = async () => {
      sweeping = false;
      await sweep;
    };
    const cpu0 = chromiumCpuMs(binary) ?? (await cdpCpuMs(cdp));
    await page.waitForTimeout(REST_MS);
    const cpu1 = chromiumCpuMs(binary) ?? (await cdpCpuMs(cdp));
    if (cpu0 !== null && cpu1 !== null) result.restCpuMsPerSec = Math.round((cpu1 - cpu0) / (REST_MS / 1000));

    const drawFramesPerSec = async () => {
      await browser.startTracing(page, { categories: ['disabled-by-default-devtools.timeline.frame'] });
      await page.waitForTimeout(TRACE_MS);
      const trace = JSON.parse((await browser.stopTracing()).toString());
      const events = trace.traceEvents ?? trace;
      return events.filter((e) => e.name === 'DrawFrame').length / (TRACE_MS / 1000);
    };
    await page.evaluate(() => {
      window.__arcFrames.clear();
      window.__arcCount = true;
    });
    result.restFramesPerSec = await drawFramesPerSec();
    const arcFrames = await page.evaluate(() => {
      window.__arcCount = false;
      return window.__arcFrames.size;
    });
    result.arcFramesPerSec = arcFrames / (TRACE_MS / 1000);
    // The clock alone: ambient arcs isolated exactly as the setting does it (click arcs stay; nobody clicks).
    if (!electricArcs && result.siteShell) {
      await page.evaluate(() => document.documentElement.setAttribute('data-electric-arcs', 'clicks'));
      await page.waitForTimeout(500);
      result.clockFramesPerSec = await drawFramesPerSec();
      await page.evaluate(() => document.documentElement.removeAttribute('data-electric-arcs'));
    }
    await stopSweep();

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
// `FRAME_GPU=1` asks for the host's real GPU instead of SwiftShader. Under
// software GL a WebGL scene runs at 2–7fps, so a frame cap on it never binds and
// a 3D route's numbers say nothing about rendering; on a machine with a GPU
// (macOS → Metal through ANGLE) this measures what a visitor's browser does.
const GPU_ARGS = process.env.FRAME_GPU
  ? ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
  : [];
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox', ...GPU_ARGS] });
// The /proc filter needs a string that appears in every child's command line.
const binary = CHROMIUM_PATH ?? chromium.executablePath();
const cdp = await browser.newBrowserCDPSession();
const gpu = await (async () => {
  const p = await browser.newPage();
  try {
    return await probeRenderer(p);
  } finally {
    await p.close();
  }
})();
console.log(describeRenderer(gpu));

const results = [];
const failures = [];
const skips = [];
for (const profile of profiles) {
  for (const route of routes) {
    const r = await measure(browser, cdp, binary, route, profile);
    results.push(r);
    const reasons = [];
    // Never a silent pass: a page that did not load (or answered 5xx) was not measured at all.
    if (r.error || r.status === undefined || r.status >= 500)
      reasons.push(`not measured (${r.error ? 'navigation error' : `HTTP ${r.status ?? '—'}`})`);
    // The cadence gate judges the clock (ambient arcs isolated; see "Why the cadence gate isolates ambient arcs").
    const cadence = r.clockFramesPerSec ?? r.restFramesPerSec;
    const what = r.clockFramesPerSec === undefined ? 'frames/s' : 'clock frames/s';
    if (r.siteShell && cadence > FRAME_LIMIT) reasons.push(`${cadence} ${what} > ${FRAME_LIMIT}`);
    if (r.siteShell && (r.infinite?.length ?? 0) > 0) reasons.push('unsanctioned perpetual animation');
    // R7 "never freezes": GPU-only. At rest (not --engaged) a site-shell page with visible haze must keep drawing.
    const r7Applies = !engaged && r.siteShell && (r.hazeCanvases ?? 0) > 0 && !r.error;
    if (r7Applies && gpu.software) {
      skips.push(`${profile} ${route}: R7 never-freezes (software GL)`);
    } else if (r7Applies && (r.clockFramesPerSec ?? r.restFramesPerSec) === 0) {
      reasons.push('R7: frozen at rest with haze visible (0 frames/s on hardware GL)');
    }
    r.gateFailures = reasons;
    const idleFail = reasons.length > 0;
    if (idleFail) failures.push(r);
    console.log(
      `${idleFail ? '✗' : ' '} ${profile.padEnd(7)} ${route.padEnd(28)} ` +
        `rest ${String(r.restFramesPerSec ?? '—').padStart(5)} frames/s ` +
        (r.clockFramesPerSec !== undefined
          ? `(clock ${String(r.clockFramesPerSec).padStart(4)}, arcs in ${String(r.arcFramesPerSec ?? 0).padStart(4)}) `
          : '') +
        `${String(r.restCpuMsPerSec ?? '—').padStart(5)} cpu-ms/s · ` +
        `idle ${r.idle?.fps ?? '—'}fps · scroll ${r.scroll?.fps ?? '—'}fps p95 ${r.scroll?.p95 ?? '—'}ms` +
        (r.jellyCarriers || r.hazeCanvases ? ` · jelly ${r.jellyCarriers ?? 0} carrier anims, ${r.hazeCanvases ?? 0} haze` : '') +
        (route === '/' && !engaged && (r.restCpuMsPerSec ?? 0) > REST_CPU_TARGET_MS ? ` · cpu > ${REST_CPU_TARGET_MS} target` : '') +
        (r.infinite?.length ? ` · ∞ ${r.infinite.slice(0, 3).join(', ')}${r.infinite.length > 3 ? ', …' : ''}` : '') +
        (r.error ? ` · ERROR ${r.error}` : '') +
        (r7Applies && gpu.software ? ' · SKIP R7 (software GL)' : '') +
        (idleFail ? ` · FAIL ${reasons.join('; ')}` : ''),
    );
  }
}
await browser.close();

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ gpu, results }, null, 2));
console.log(
  `\n${results.length - failures.length}/${results.length} route(s) passed, ${skips.length} GPU-only check(s) skipped, ${failures.length} failed — ${describeRenderer(gpu)}`,
);
if (skips.length) {
  console.log(`SKIP R7 never-freezes on ${skips.length} route(s): software GL (${gpu.renderer || 'no WebGL'}) — run with FRAME_GPU=1 on a real GPU to judge it.`);
  annotateSkip('frame-budget SKIP', `R7 never-freezes not judged on ${skips.length} route(s): software GL`);
}
if (gate && failures.length > 0) {
  console.error(
    `\n${failures.length} route(s) failed the gate: ${failures.map((f) => `${f.profile} ${f.route} (${f.gateFailures.join('; ')})`).join(', ')}.` +
      `\nRest/engaged limit ${FRAME_LIMIT} clock frames/s (ambient arcs isolated); no unsanctioned perpetual animation; every route must load.` +
      `\nAt rest the jelly runs on its ${IDLE_FLOOR_HZ} Hz idle floor (R7) and nothing else may tick; anything faster re-renders on every vsync —` +
      `\nsee docs/plasmatic-jelly-system.md and docs/performance-audit-2026-10-08.md.`,
  );
  process.exit(1);
}
