// ─────────────────────────────────────────────────────────────────────────────
// Globe eversion — smoothness and photosensitivity (T35; spec §11.2 S#31, S#32).
//
// DETERMINISTIC STILLS, NOT A SCREENCAST. The detector renders the timeline at a
// fixed fine step by scrubbing it (the core's `scrub` debug op, driven through the
// lab page's `window.__eversionLab`), screenshots each still, and runs the jerk
// detector over consecutive stills. Nothing depends on how fast the rig draws, so
// it gives the same verdict on a software-GL box (1 fps) as on a GPU (review R7
// Major 1: the old screencast sampled ~1.5 fps against a 50 ms-clamped timeline,
// so it flagged natural motion and could not find an injected cut).
//
// Needs a DEV server with the lab open (a production build ignores EVERSION_LAB_OPEN):
//
//   EVERSION_LAB_OPEN=1 XAI_API_KEY=x OPENAI_API_KEY=x pnpm exec vite dev --port 7371 --strictPort --host 127.0.0.1
//   BASE_URL=http://127.0.0.1:7371 node testing/e2e/eversion-smoothness.mjs --quick
//
//   --quick               dark theme, 3 fast-forwards (about 11 min on a loaded 4-core software-GL box)
//   --themes a,b          dark | light | high-contrast   (default: all three for the uninterrupted
//                         run; every other scenario uses the first; --quick: dark)
//   --ff-runs N           fast-forward instants for S#31(b) (default 20; --quick 3)
//   --seed N              seed of the instants (default 31)
//   --cut-ratio R         S#31 threshold: a step this many times larger than both neighbours (default 2)
//   --only a,b,c,d,prove  (a) uninterrupted (b) seeded fast-forwards (c) AFTER arrives at 4 s
//                         (d) destination fails (500); prove = the detector self-proof
//   --no-prove            skip the self-proof
//   --step MS             base still spacing on the timeline, a multiple of 8 (default 16)
//   --size WxH            lab stage size in px (default 256x168; smaller is faster)
//   --workers N           lab pages rendering in parallel (default 4)
//   --screencast          ALSO run the optional screencast variant (real hub; needs >= ~10 fps)
//   --out DIR             evidence / JSON report directory (default $EVERSION_ARTIFACT_DIR or tmp)
//
// Every failure names its S#. Exit code is non-zero if any scenario fails.
//
// ## What is rendered
//
// The lab draws the real renderer over the real timeline (same core, same shaders) with
// synthetic BEFORE / AFTER / placeholder pages. What the stills therefore judge is the
// effect's own motion: radius, centre, spin, tilt, eversion, unwrap, the AFTER crossfade, the
// final dissolve (it overlaps UNWRAP's tail and ends with it; there is no POP stage and no fade after UNWRAP). The CSS hub fade and the orb's fade are outside it.
//
// A scenario is a script for the replay: when AFTER becomes ready (`afterAt`), when the user
// fast-forwards (`ffAt`), or that AFTER fails (`failAt`). A still at timeline time T replays a
// fresh timeline from 0 in 8 ms steps and draws, so stills at multiples of 8 ms belong to one
// consistent run, and a re-plan (fast-forward, late AFTER) lands on the same step in all of them.
//
// ## Sampling
//
// Every `--step` (16 ms) from 0 to the end of the run, plus the odd multiples of 8 ms within
// 48 ms either side of every stage boundary and scripted event (stage changes read from the stills
// themselves; AFTER ready, fast-forward, failure, the injected cut): 8 ms spacing exactly where
// a re-plan could leave a step.
//
// ## S#31 — the jerk detector
//
// `d_i` is the mean absolute per-pixel difference of consecutive stills (`frameDeltaSeries`),
// scaled to "per 16 ms of timeline" (stills are 8 or 16 ms apart). The scale of `d` varies ~100x
// across one correct run (a wrap shrinks the page a lot per step, an unwrap barely moves it), so
// the run's median is no yardstick - the spec's "4x the median" rule is what failed on a loaded rig
// in review R7 - and the detector asks the local question instead: is this step larger than BOTH of
// its neighbours by `cut-ratio` (default 2)? C2 continuity makes every legitimate speed-up a ramp
// (onset from rest, the fast-forward, the AFTER crossfade, the page-alpha fade), and a ramp's
// steps never exceed the one after them; a re-plan that forgot a channel's state is a step in one
// frame between two smooth neighbours. The series `d_i / max(d_(i-1), d_(i+1), floor)` is handed to
// `detectHardCuts` with threshold `cut-ratio`; `floor` is half the run's median over its moving steps
// (steps under 1e-4 are stationary: a held gate, the tail), so noise between two still frames is not
// a spike. No window is excluded: the deliberate crossfades are inside the test, and pass it.
//
// The self-proof (`prove`) turns on the `inject-hard-cut` debug op from 2000 ms on: the drawn
// radius of the globe steps by 30 % between two stills, which is what a re-plan that forgot a
// channel's state would look like. The detector must flag exactly that step (and no other), and the
// unmodified run must report none. If either fails the detector is broken, and the suite says so.
//
// ## S#32 — photosensitivity
//
// Relative luminance of every still (`luminanceSeries`); no two stills within 100 ms of timeline
// may differ by more than 0.20 (`detectLuminanceJumps`). Stills are at most 16 ms apart, so the
// coverage is complete by construction (it is printed anyway).
// ─────────────────────────────────────────────────────────────────────────────

/* global performance, localStorage, requestAnimationFrame -- used only inside page.evaluate() / addInitScript callbacks. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASE_URL, THEMES, launchBrowser, writeArtifact } from './lib/eversion-session.mjs';
import { FF_REMAINING_MS, PLACEHOLDER_XFADE_MS } from '../../lib/eversion/constants.ts';
import {
  decodeImage,
  detectHardCuts,
  detectLuminanceJumps,
  frameDeltaSeries,
  luminanceSeries,
} from './lib/image-metrics.mjs';

/* ── CLI ──────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const QUICK = flag('--quick');
const THEMES_RUN = opt('--themes', QUICK ? 'dark' : 'dark,light,high-contrast').split(',');
const FF_RUNS = Number(opt('--ff-runs', QUICK ? '3' : '20'));
const SEED = Number(opt('--seed', '31'));
const CUT_RATIO = Number(opt('--cut-ratio', '2'));
const ONLY = new Set(opt('--only', '').split(',').filter(Boolean));
const PROVE = !flag('--no-prove');
const STEP = Number(opt('--step', '16'));
const [SIZE_W, SIZE_H] = opt('--size', '256x168').split('x').map(Number);
const WORKERS = Number(opt('--workers', '4'));
if (opt('--out')) process.env.EVERSION_ARTIFACT_DIR = opt('--out');
const wants = (name) => ONLY.size === 0 || ONLY.has(name);
if (STEP % 8 !== 0 || STEP <= 0) throw new Error('--step must be a positive multiple of 8');

/** Spec constants the analysis reasons in (lib/eversion/constants.ts). */
const GRID_MS = 8;
const RATE_PER_MS = 16;
const FLASH_JUMP = 0.2;
const FLASH_WINDOW_MS = 100;
const FLOOR_OF_MEDIAN = 0.5;
const STATIONARY = 1e-4;
const NEAR_MS = 48;
const FF_INSTANT_RANGE = [100, 4600];
const AFTER_EARLY_MS = 400;
const AFTER_LATE_MS = 4000;
const FAIL_AT_MS = 704;
const INJECT_AT_MS = 2000;
const INJECT_CHANNEL = 'radius';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

class Fail extends Error {}
const fmt = (n, d = 0) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : String(n));
const grid = (t) => Math.round(t / GRID_MS) * GRID_MS;

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** mulberry32: a seeded PRNG so a failing instant can be replayed. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── The optional screencast variant ──────────────────────────────────────── */

if (flag('--screencast')) {
  const rest = argv.filter((a) => a !== '--screencast');
  const r = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./eversion-smoothness-screencast.mjs', import.meta.url)), ...rest],
    { stdio: 'inherit' },
  );
  console.log(`(screencast variant exited ${r.status}; it is rig-limited, see its header)`);
  // Fall through: the deterministic suite below is the gate.
}

/* ── The lab pages ────────────────────────────────────────────────────────── */

const report = { scenarios: [] };
const results = [];
let browser = null;

async function openLab(theme) {
  const context = await browser.newContext({
    viewport: { width: SIZE_W, height: SIZE_H },
    deviceScaleFactor: 1,
    colorScheme: THEMES[theme].colorScheme,
  });
  await context.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch {
      /* storage blocked: the theme falls back to the OS scheme, which is set too */
    }
  }, THEMES[theme].localStorage);
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(`${BASE_URL}/eversion-lab?eversion-debug=1`, { waitUntil: 'load' });
  if (!page.url().includes('/eversion-lab')) {
    throw new Fail(`redirected to ${page.url()} - start the dev server with EVERSION_LAB_OPEN=1`);
  }
  await page.waitForFunction(() => window.__eversionLab, null, { timeout: 120_000 });
  // The lab's control panel and the debug overlay sit over a small stage: the stills are of the canvas.
  await page.addStyleTag({
    content:
      '[data-eversion-lab-panel],[data-eversion-lab-stats],[data-eversion-debug-overlay]{visibility:hidden!important}',
  });
  await page.waitForTimeout(1500);
  return { context, page, stage: page.locator('[data-eversion-lab-stage]'), problems };
}

async function openPool(theme) {
  const pool = [];
  for (let i = 0; i < WORKERS; i++) pool.push(await openLab(theme));
  return pool;
}

const closePool = (pool) => Promise.all(pool.map((p) => p.context.close().catch(() => {})));

/** Scrub `script` to `t` on `lab`; resolves with the core's stage at that time. */
function scrubStage(lab, script, t, hardCut = null) {
  return lab.page.evaluate(
    ([command, cut]) => window.__eversionLab.scrub(command, cut),
    [{ op: 'scrub', t, ...script }, hardCut],
  );
}

/** Scrub and screenshot one still. */
async function still(lab, script, t, hardCut) {
  const r = await scrubStage(lab, script, t, hardCut);
  // The core drew synchronously; give the compositor two frames to present it.
  await lab.page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  const png = await lab.stage.screenshot({ type: 'png' });
  return { t, stage: r.stage, png };
}

/** Render every time in `times` over the pool; resolves with the stills sorted by time. */
async function renderAll(pool, script, times, cutAt) {
  const queue = [...times];
  const out = [];
  await Promise.all(
    pool.map(async (lab) => {
      for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
        out.push(await still(lab, script, t, cutAt !== null && t >= cutAt ? INJECT_CHANNEL : null));
      }
    }),
  );
  return out.sort((a, b) => a.t - b.t);
}

/** The first multiple of 8 ms at which the replay is `done` (exponential, then bisection). */
async function runEnd(lab, script) {
  let hi = 2048;
  while ((await scrubStage(lab, script, hi)).stage !== 'done') {
    hi *= 2;
    if (hi > 60_000) throw new Fail('the scripted timeline never reaches done (60 s)');
  }
  let lo = 0;
  while (hi - lo > GRID_MS) {
    const mid = grid((lo + hi) / 2);
    if ((await scrubStage(lab, script, mid)).stage === 'done') hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Render a scripted run: the base grid, then 8 ms stills around every boundary and event. */
async function captureRun(pool, script, { cutAt = null } = {}) {
  const end = await runEnd(pool[0], script);
  const last = end + NEAR_MS;
  const base = new Set();
  for (let t = 0; t <= last; t += STEP) base.add(t);
  if (cutAt !== null) base.add(cutAt);
  const first = await renderAll(
    pool,
    script,
    [...base].sort((a, b) => a - b),
    cutAt,
  );

  const hints = [];
  for (let i = 1; i < first.length; i++) {
    if (first[i].stage !== first[i - 1].stage) hints.push(first[i].t);
  }
  for (const h of [script.afterAt, script.ffAt, script.failAt, cutAt]) {
    if (typeof h === 'number') hints.push(h);
  }
  const extra = new Set();
  for (const h of hints) {
    for (let t = grid(h) - NEAR_MS; t <= h + NEAR_MS; t += GRID_MS) {
      if (t >= 0 && t <= last && !base.has(t)) extra.add(t);
    }
  }
  const more = await renderAll(
    pool,
    script,
    [...extra].sort((a, b) => a - b),
    cutAt,
  );
  const stills = [...first, ...more].sort((a, b) => a.t - b.t);
  // The run's stages in the order the timeline emits them: ... unwrap, uncover (the page is asked to show
  // itself), reveal (the dissolve starts, overlapping UNWRAP's tail), done (UNWRAP and the dissolve end together).
  const revealStart = stills.find((s) => s.stage === 'reveal' || s.stage === 'done')?.t ?? end;
  const uncoverStart =
    stills.find((s) => ['uncover', 'reveal', 'done'].includes(s.stage))?.t ?? end;
  return { script, stills, end, revealStart, uncoverStart, cutAt };
}

/* ── The detectors over a set of stills ───────────────────────────────────── */

async function analyse(run) {
  const { script, stills, end, revealStart, uncoverStart } = run;
  if (stills.length < 40) throw new Fail(`only ${stills.length} stills - cannot judge smoothness`);
  const imgs = [];
  for (const s of stills) imgs.push(await decodeImage(s.png));
  const times = stills.map((s) => s.t);
  const raw = frameDeltaSeries(imgs);
  // Scaled to "per 16 ms of timeline": stills are 8 or 16 ms apart.
  const deltas = raw.map((d, i) => (d * RATE_PER_MS) / (times[i + 1] - times[i]));
  const moving = deltas.filter((d) => d > STATIONARY);
  const med = Math.max(median(moving), 1e-5);

  // A hard cut is a step LARGER THAN BOTH its neighbours: C2 continuity makes every legitimate
  // speed-up a ramp (an onset from rest, a fast-forward, the AFTER crossfade), so a
  // ramp's steps never exceed the one after them. The run's own median is not a usable
  // yardstick (the change per step varies ~100x between the wrap and the unwrap), only the noise floor.
  const floor = FLOOR_OF_MEDIAN * med;
  const spike = deltas.map((d, i) => d / Math.max(deltas[i - 1] ?? 0, deltas[i + 1] ?? 0, floor));
  const cuts = detectHardCuts(spike, times, { threshold: CUT_RATIO }).map((c) => ({
    ...c,
    delta: deltas[c.index],
    spike: c.delta,
  }));
  const maxSpike = spike.length ? Math.max(...spike) : 0;
  const maxAt = times[spike.indexOf(maxSpike) + 1];
  const windows = [];
  if (typeof script.afterAt === 'number') {
    windows.push({
      name: 'AFTER crossfade',
      from: script.afterAt,
      to: script.afterAt + PLACEHOLDER_XFADE_MS,
    });
  }
  if (typeof script.ffAt === 'number') {
    windows.push({ name: 'fast-forward', from: script.ffAt, to: script.ffAt + FF_REMAINING_MS });
  }
  // The final dissolve OVERLAPS UNWRAP's tail and ends with it, so the two are one window; `uncover` precedes
  // the dissolve by the round trip, during which the picture is the still-opaque canvas (nothing changes on it).
  windows.push({ name: 'dissolve + UNWRAP tail', from: uncoverStart, to: end });
  windows.push({ name: 'reveal', from: revealStart, to: end });

  // S#32 on the timeline axis (exact: stills carry their own timeline time).
  const lums = luminanceSeries(imgs);
  const jumps = detectLuminanceJumps(times, lums, {
    threshold: FLASH_JUMP,
    windowMs: FLASH_WINDOW_MS,
  });
  let maxJump = 0;
  let pairs = 0;
  let covered = 0;
  for (let i = 0; i < times.length; i++) {
    for (let j = i + 1; j < times.length && times[j] - times[i] <= FLASH_WINDOW_MS; j++) {
      maxJump = Math.max(maxJump, Math.abs(lums[j] - lums[i]));
    }
    if (i + 1 < times.length) {
      pairs++;
      if (times[i + 1] - times[i] <= FLASH_WINDOW_MS) covered++;
    }
  }

  return {
    stills: stills.length,
    end,
    medianDelta: med,
    maxDelta: Math.max(...deltas),
    maxSpike,
    maxSpikeAt: maxAt,
    cuts,
    windows,
    jumps,
    maxJump,
    coverage: pairs ? covered / pairs : 0,
    times,
    deltas,
  };
}

function line(a) {
  return `stills ${a.stills} (end ${a.end} ms), step change: median ${fmt(a.medianDelta, 5)}, max ${fmt(a.maxDelta, 5)}; largest step-over-neighbours ${fmt(a.maxSpike, 2)}x at ${fmt(a.maxSpikeAt)} ms (limit ${CUT_RATIO}x), cuts ${a.cuts.length}; luminance: max 100 ms jump ${fmt(a.maxJump, 3)} (limit ${FLASH_JUMP}), pair coverage ${fmt(a.coverage * 100)} %`;
}

function assertSmooth(label, a) {
  if (a.cuts.length) {
    const c = a.cuts[0];
    throw new Fail(
      `S#31 (${label}): ${a.cuts.length} hard cut(s); first at ${fmt(c.atMs)} ms (timeline), step ${fmt(c.delta, 5)} = ${fmt(c.spike, 1)}x its larger neighbour (limit ${CUT_RATIO}x; run median ${fmt(a.medianDelta, 5)})`,
    );
  }
  if (a.jumps.length) {
    const j = a.jumps[0];
    throw new Fail(
      `S#32 (${label}): luminance changed by ${fmt(j.jump, 3)} (> ${FLASH_JUMP}) within ${FLASH_WINDOW_MS} ms of timeline between ${fmt(j.fromMs)} and ${fmt(j.toMs)} ms`,
    );
  }
}

function strip(a) {
  const { windows, jumps, cuts, times, deltas, ...rest } = a;
  return {
    ...rest,
    cuts: cuts.map((c) => ({ atMs: c.atMs, delta: c.delta, spike: c.spike })),
    windows: windows.map((w) => ({ name: w.name, from: Math.round(w.from), to: Math.round(w.to) })),
    jumps: jumps.length,
    series: times.slice(1).map((t, i) => [t, Number(deltas[i].toFixed(6))]),
  };
}

/** Evidence for a failing run: the stills either side of the first cut. */
function saveEvidence(run, a, label) {
  try {
    const c = a.cuts[0];
    if (!c) return;
    const name = label.replace(/[^a-z0-9]+/gi, '-');
    writeArtifact(
      `eversion-smoothness/${name}-before-${a.times[c.index]}.png`,
      run.stills[c.index].png,
    );
    writeArtifact(`eversion-smoothness/${name}-after-${c.atMs}.png`, run.stills[c.index + 1].png);
  } catch {
    /* evidence is best-effort */
  }
}

/* ── Scenarios ────────────────────────────────────────────────────────────── */

async function runScenario(ctx, pool, scenario, label, script, { assert = true } = {}) {
  const run = await captureRun(pool, script);
  const a = await analyse(run);
  report.scenarios.push({ ...ctx.tag, scenario, script, ...strip(a) });
  ctx.numbers.push(`${label}: ${line(a)}`);
  if (assert) {
    try {
      assertSmooth(label, a);
    } catch (e) {
      saveEvidence(run, a, `${ctx.tag.theme}-${scenario}`);
      throw e;
    }
  }
  return a;
}

async function uninterrupted(ctx, pool) {
  ctx.clean = await runScenario(ctx, pool, 'uninterrupted', '(a) uninterrupted', {
    afterAt: AFTER_EARLY_MS,
  });
}

async function fastForwards(ctx, pool) {
  const rand = rng(SEED);
  const instants = Array.from({ length: FF_RUNS }, () =>
    grid(FF_INSTANT_RANGE[0] + rand() * (FF_INSTANT_RANGE[1] - FF_INSTANT_RANGE[0])),
  );
  ctx.numbers.push(`(b) fast-forward instants (timeline ms, seed ${SEED}): ${instants.join(' ')}`);
  let worst = 0;
  const failures = [];
  for (let i = 0; i < instants.length; i++) {
    try {
      const a = await runScenario(ctx, pool, 'fast-forward', `(b) #${i + 1} ff@${instants[i]} ms`, {
        afterAt: AFTER_EARLY_MS,
        ffAt: instants[i],
      });
      worst = Math.max(worst, a.maxSpike);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      failures.push(e.message);
    }
  }
  ctx.numbers.push(
    `(b) worst step-over-neighbours over ${instants.length} runs: ${fmt(worst, 2)}x`,
  );
  if (failures.length)
    throw new Fail(`${failures.length} of ${instants.length} runs: ${failures[0]}`);
}

async function lateAfter(ctx, pool) {
  await runScenario(ctx, pool, 'late-after-4s', '(c) AFTER ready at 4 s', {
    afterAt: AFTER_LATE_MS,
  });
}

async function failingDestination(ctx, pool) {
  await runScenario(ctx, pool, 'destination-500', '(d) destination fails (500)', {
    afterAt: null,
    failAt: FAIL_AT_MS,
  });
}

/** The detector must pass the unmodified run and FAIL, at the injected instant, on a stepped one. */
async function selfProof(ctx, pool) {
  const script = { afterAt: AFTER_EARLY_MS };
  // The unmodified run is scenario (a)'s when it ran in this invocation; otherwise render it.
  const clean = ctx.clean ?? (await analyse(await captureRun(pool, script)));
  ctx.numbers.push(`(prove) unmodified: ${line(clean)}`);
  if (clean.cuts.length) {
    throw new Fail(
      `S#31 (self-proof): the unmodified run reported ${clean.cuts.length} cut(s) (first at ${fmt(clean.cuts[0].atMs)} ms) - the detector has false positives`,
    );
  }
  const run = await captureRun(pool, script, { cutAt: INJECT_AT_MS });
  const a = await analyse(run);
  report.scenarios.push({ ...ctx.tag, scenario: 'self-proof', cutAt: INJECT_AT_MS, ...strip(a) });
  ctx.numbers.push(`(prove) 30 % ${INJECT_CHANNEL} step from ${INJECT_AT_MS} ms: ${line(a)}`);
  if (!a.cuts.length) {
    throw new Fail(
      `S#31 (self-proof): the detector did NOT flag the injected hard cut (largest step over its neighbours ${fmt(a.maxSpike, 2)}x, limit ${CUT_RATIO}x). A detector that passes a visible 30 % radius jump proves nothing`,
    );
  }
  const stray = a.cuts.filter((c) => Math.abs(c.atMs - INJECT_AT_MS) > STEP);
  if (stray.length) {
    throw new Fail(
      `S#31 (self-proof): cuts flagged away from the injection (${INJECT_AT_MS} ms): ${stray.map((c) => fmt(c.atMs)).join(', ')} ms`,
    );
  }
  const hit = a.cuts[0];
  ctx.numbers.push(
    `(prove) flagged only the injected cut: ${a.cuts.length} cut at ${fmt(hit.atMs)} ms, step ${fmt(hit.delta, 5)} = ${fmt(hit.spike, 1)}x its larger neighbour`,
  );
}

/* ── Plan ─────────────────────────────────────────────────────────────────── */

console.log(
  `eversion-smoothness: ${BASE_URL} stills ${SIZE_W}x${SIZE_H} step ${STEP} ms (+8 ms near boundaries) workers=${WORKERS} themes=${THEMES_RUN} ff-runs=${FF_RUNS} seed=${SEED}${QUICK ? ' (quick)' : ''}`,
);

browser = await launchBrowser();
for (const theme of THEMES_RUN) {
  if (!THEMES[theme]) throw new Error(`unknown theme "${theme}"`);
  const primary = theme === THEMES_RUN[0];
  const ctx = { tag: { theme }, numbers: [] };
  const steps = [];
  if (wants('a')) steps.push(['(a) uninterrupted', uninterrupted]);
  if (primary) {
    if (wants('b')) steps.push([`(b) ${FF_RUNS} fast-forwards`, fastForwards]);
    if (wants('c')) steps.push(['(c) AFTER ready at 4 s', lateAfter]);
    if (wants('d')) steps.push(['(d) destination fails (500)', failingDestination]);
    if (PROVE && wants('prove')) steps.push(['(prove) detector self-proof', selfProof]);
  }
  if (!steps.length) continue;
  let pool;
  try {
    pool = await openPool(theme);
  } catch (e) {
    const failure = e instanceof Fail ? e.message : `S#31: lab did not open: ${e?.message ?? e}`;
    results.push({ name: theme, label: 'open the lab', ok: false, failure, secs: 0 });
    console.log(`FAIL open the lab [${theme}]\n     ${failure}`);
    continue;
  }
  for (const [label, fn] of steps) {
    const t0 = performance.now();
    let failure = null;
    try {
      await fn(ctx, pool);
    } catch (e) {
      failure = e instanceof Fail ? e.message : `S#31: unexpected ${e?.stack ?? e}`;
    }
    const secs = Math.round((performance.now() - t0) / 1000);
    results.push({ name: theme, label, ok: !failure, failure, secs });
    console.log(`${failure ? 'FAIL' : 'PASS'} ${label} [${theme}] (${secs} s)`);
    for (const n of ctx.numbers.splice(0)) console.log(`     ${n}`);
    if (failure) console.log(`     ${failure}`);
  }
  const problems = pool.flatMap((p) => p.problems);
  if (problems.length) {
    const failure = `lab console errors: ${[...new Set(problems)].slice(0, 3).join(' | ')}`;
    results.push({ name: theme, label: 'lab page errors', ok: false, failure, secs: 0 });
    console.log(`FAIL lab page errors [${theme}]\n     ${failure}`);
  }
  await closePool(pool);
}
await browser.close();

try {
  const file = writeArtifact('eversion-smoothness.json', JSON.stringify(report, null, 2));
  console.log(`report: ${file}`);
} catch {
  /* evidence is best-effort */
}

const failed = results.filter((r) => !r.ok);
console.log('\nSummary');
for (const r of results) console.log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.label} [${r.name}]`);
console.log(failed.length ? `${failed.length} scenario(s) failed` : 'all scenarios passed');
process.exit(failed.length ? 1 : 0);
