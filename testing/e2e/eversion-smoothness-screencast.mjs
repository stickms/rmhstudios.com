// ─────────────────────────────────────────────────────────────────────────────
// Globe eversion — smoothness and photosensitivity, SCREENCAST variant (S#31, S#32).
// OPTIONAL EXTRA. The gate is `eversion-smoothness.mjs`, which renders deterministic
// stills by scrubbing the timeline and works on any rig. This variant drives the real
// hub and judges the frames the compositor actually presented (CDP screencast), which
// is only meaningful when that is >= ~10 fps: on a software-GL box it samples about
// 1.5 fps against a timeline clamped to 50 ms steps, so its median rule fires on natural
// motion and its self-proof cannot find the injected step (review R7 Major 1).
// Run it through `eversion-smoothness.mjs --screencast [same flags]`, or directly:
//
//   pnpm exec vite dev --port 7322 --strictPort --host 127.0.0.1      # terminal 1
//   BASE_URL=http://127.0.0.1:7322 node testing/e2e/eversion-smoothness-screencast.mjs --quick
//
//   --quick               desktop × dark, 3 fast-forward runs
//   --profiles a,b        desktop | mobile                (default: both; --quick: desktop)
//   --themes a,b          dark | light | high-contrast    (default: dark,light,high-contrast for the
//                         uninterrupted run; every other run uses the first)
//   --ff-runs N           fast-forward instants for S#31(b) (default 20; --quick 3)
//   --seed N              seed of the instants (default 31)
//   --cut-ratio R         S#31 threshold in multiples of the run's median frame delta (default 4)
//   --only a,b,c,d,prove  which scenarios: (a) uninterrupted (b) fast-forward (c) 4 s delayed
//                         destination (d) 500 destination; prove = the detector self-proof
//   --no-prove            skip the self-proof
//   --out DIR             evidence / JSON report directory (default $EVERSION_ARTIFACT_DIR or tmp)
//
// Every failure names its S#. Exit code is non-zero if any scenario fails.
//
// ## S#31 — the jerk detector
//
// For each recording: the mean absolute per-pixel difference between consecutive
// frames (`frameDeltaSeries`), normalised by THE RUN'S MEDIAN; any frame above
// `cut-ratio` x the median outside the documented crossfade windows is a hard cut
// (`detectHardCuts`). The windows come from the controller's marks, never from
// hard-coded wall times:
//
//   hub fade      [start, cover + 1.5 frames]            the CSS fade of the hub over the page
//   AFTER fade    [gate-open - 320 ms*k - 2 frames, +1]  placeholder -> AFTER (only when after-ready)
//   reveal        [reveal - 1 frame, done]               page-texture fade onto the live page (the end of the run)
//
// `k` is the rig's timeline slowdown (see timelineSlowdown in lib/eversion-drive.mjs):
// the timeline clamps each frame to 50 ms, so below 20 fps one frame is one 50 ms
// step whatever the wall time, which is what makes the deltas of a slow run comparable
// at all, and what makes the crossfade windows 320 timeline-ms x k of wall time.
//
// Fast-forward (b) deliberately traverses the rest of the path in 650 ms: per frame
// that is up to ~7x the median step, so a median rule alone would flag a correct
// fast-forward. Inside [fast-forward, done] a hard cut is therefore a SPIKE: a
// delta above the ratio x median that is also > 2.5x BOTH neighbouring deltas (C2
// continuity makes a legitimate speed-up a ramp, never a spike). Outside that
// window the plain rule applies. The numbers are printed so the choice can be audited.
//
// The self-proof (`prove`) turns on the `inject-hard-cut` debug op (lib/eversion/gl/
// core.ts) mid-EVERSION: the drawn radius of the globe steps by 30 % in one frame, which
// is what a re-plan that forgot a channel's state would look like. The detector must
// FAIL on that recording, at the injected instant. If it does not, the detector is
// broken, and the suite says so.
//
// ## S#32 — photosensitivity
//
// Relative luminance of every frame (`luminanceSeries`); no two frames within 100 ms
// may differ by more than 0.20 (`detectLuminanceJumps`). "Within 100 ms" is measured on
// the timeline axis for the same reason as above: frame times are mapped to timeline
// time with the run's k, so a 3 fps rig is judged on what a 60 fps one would show. The
// share of frame pairs that fall inside the window is reported (coverage), because a
// rig sampling too sparsely checks nothing.
// ─────────────────────────────────────────────────────────────────────────────

/* global performance -- used only inside page.evaluate() callbacks. */
import {
  BASE_URL,
  EVERSION_MARKS,
  launchBrowser,
  openSession,
  writeArtifact,
} from './lib/eversion-session.mjs';
import {
  RUN_MS,
  destinationDelayTimeline,
  interceptDestination,
  markMap,
  openApp,
  sleepUntilPage,
  timelineSlowdown,
} from './lib/eversion-drive.mjs';
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
const PROFILES_RUN = opt('--profiles', QUICK ? 'desktop' : 'desktop,mobile').split(',');
const THEMES_RUN = opt('--themes', QUICK ? 'dark' : 'dark,light,high-contrast').split(',');
const FF_RUNS = Number(opt('--ff-runs', QUICK ? '3' : '20'));
const SEED = Number(opt('--seed', '31'));
const CUT_RATIO = Number(opt('--cut-ratio', '4'));
const ONLY = new Set(opt('--only', '').split(',').filter(Boolean));
const PROVE = !flag('--no-prove');
if (opt('--out')) process.env.EVERSION_ARTIFACT_DIR = opt('--out');
const wants = (name) => ONLY.size === 0 || ONLY.has(name);

/** Spec constants the analysis reasons in (lib/eversion/constants.ts). */
const PLACEHOLDER_XFADE_MS = 320;
const FLASH_JUMP = 0.2;
const FLASH_WINDOW_MS = 100;
const SPIKE_NEIGHBOUR = 2.5;
const FF_INSTANT_RANGE = [100, 4600];
const HREFS = ['/games', '/library', '/communities', '/store', '/predictions'];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

class Fail extends Error {}
const fmt = (n, d = 0) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : String(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const report = { scenarios: [] };
const results = [];
let browser = null;

async function freshApp(ctx, { debug = false, dest = null } = {}) {
  const s = await openSession({
    browser,
    profile: ctx.profile,
    theme: ctx.theme,
    debug,
  });
  const errors = [];
  ctx.sessions.push(s);
  // The destination interception goes in BEFORE the page loads: the shell preloads the
  // destination's data at load, so one installed at the click would delay nothing.
  const intercept = dest
    ? await interceptDestination(s.page, { mode: dest, match: /routes\/_site\/explore/ })
    : null;
  intercept?.arm();
  const app = await openApp(s, '/', { errors });
  app.errors = errors;
  app.intercept = intercept;
  await s.page.waitForTimeout(8000);
  return app;
}

/**
 * One recorded run through the real hub (pin click). Returns the marks, the
 * frames and the instants the harness acted at (page clock).
 */
async function recordedRun(
  app,
  { href, ffAtTimeline = null, k0 = 1, dest = null, destDelayMs = 0, inject = false },
) {
  const { s, page } = app;
  await app.openHub();
  await s.clearMarks();
  // Installed (and armed) by freshApp BEFORE the page loaded: see interceptDestination.
  const intercept = app.intercept ?? null;
  await s.startRecording({ format: 'jpeg', quality: 60, maxWidth: 480 });
  const acted = {};
  try {
    await app.confirm('click', href);
    const began = await app.waitStarted();
    if (began.kind !== 'started') {
      throw new Fail(
        `the run did not start (${began.kind}${began.reason ? `: ${began.reason}` : ''}) — cannot record a run`,
      );
    }
    const cover = await s.waitForMark(EVERSION_MARKS.cover, { timeout: RUN_MS });
    if (ffAtTimeline !== null) {
      // The instant is a timeline time; wall time is cover + k0 x (t - 50), k0 from the
      // uninterrupted run on this rig.
      const at = cover.startTime + k0 * Math.max(0, ffAtTimeline - 50);
      await sleepUntilPage(page, at);
      const finished = await page.evaluate(
        (n) => performance.getEntriesByName(n, 'mark').length > 0,
        EVERSION_MARKS.done,
      );
      if (!finished) {
        acted.ffAt = await page.evaluate(() => performance.now());
        await page.keyboard.press('Escape');
      }
    }
    if (dest === 'hold' || inject) {
      const evert = await s.waitForMark(EVERSION_MARKS.evert, { timeout: RUN_MS });
      const k = timelineSlowdown({ cover: cover.startTime, evert: evert.startTime });
      acted.k = k;
      if (dest === 'hold') {
        if (intercept.held() === 0) {
          throw new Fail(
            'no request for the destination data was held, so nothing was delayed (the loader did not fetch)',
          );
        }
        const timelineDelay = destinationDelayTimeline(destDelayMs, k);
        await sleepUntilPage(page, cover.startTime + k * timelineDelay);
        intercept.release();
        acted.releasedAt = await page.evaluate(() => performance.now());
      }
      if (inject) {
        await sleepUntilPage(page, cover.startTime + k * 2000);
        acted.injectAt = await page.evaluate(() => {
          window.__eversion.renderer.injectHardCut('radius');
          return performance.now();
        });
      }
    }
    const marks = await app.waitDone();
    const frames = await s.stopRecording();
    if (dest === 'fail' && intercept.failed() === 0) {
      throw new Fail('no destination data request was failed, so the 500 case did not happen');
    }
    return { marks, frames, acted, href };
  } finally {
    await s.stopRecording().catch(() => {});
    intercept?.release();
  }
}

/* ── The detectors over a recording ───────────────────────────────────────── */

async function analyse(run, { cutRatio = CUT_RATIO } = {}) {
  const m = markMap(run.marks);
  const done = run.marks.find((x) => x.name === EVERSION_MARKS.done);
  if (m.start === undefined || m.cover === undefined || m.done === undefined) {
    throw new Fail(`the run is missing marks: ${JSON.stringify(m)}`);
  }
  const k = timelineSlowdown(m);
  const gate = run.marks.find((x) => x.name === EVERSION_MARKS.gateOpen)?.detail?.reason;
  const inRun = run.frames.filter((f) => f.tMs >= m.start - 50 && f.tMs <= m.done + 300);
  if (inRun.length < 8) {
    throw new Fail(
      `only ${inRun.length} frames were recorded across the run — cannot judge smoothness`,
    );
  }
  const imgs = [];
  for (const f of inRun) imgs.push(await decodeImage(f.buffer));
  const times = inRun.map((f) => f.tMs);
  const deltas = frameDeltaSeries(imgs);
  const intervals = times.slice(1).map((t, i) => t - times[i]);
  const fi = median(intervals);
  const med = Math.max(median(deltas), 1e-5);

  const windows = [{ name: 'hub fade', from: m.start - 50, to: m.cover + 1.5 * fi }];
  if (gate === 'after-ready' && m.gateOpen !== undefined) {
    windows.push({
      name: 'AFTER fade',
      from: m.gateOpen - PLACEHOLDER_XFADE_MS * k - 2 * fi,
      to: m.gateOpen + fi,
    });
  }
  const revealAt = m.reveal ?? m.done;
  windows.push({ name: 'reveal', from: revealAt - fi, to: m.done + 300 });

  const cuts = [];
  const ffWindow = run.acted.ffAt !== undefined ? { from: run.acted.ffAt, to: m.done } : null;
  const plain = detectHardCuts(deltas, times, {
    threshold: med * cutRatio,
    exclude: ffWindow ? [...windows, ffWindow] : windows,
  });
  cuts.push(...plain.map((c) => ({ ...c, rule: 'median' })));
  if (ffWindow) {
    for (let i = 0; i < deltas.length; i++) {
      const at = times[i + 1];
      if (at < ffWindow.from || at > ffWindow.to) continue;
      if (windows.some((w) => at >= w.from && at <= w.to)) continue;
      const near = Math.max(deltas[i - 1] ?? 0, deltas[i + 1] ?? 0);
      if (deltas[i] > med * cutRatio && deltas[i] > SPIKE_NEIGHBOUR * near) {
        cuts.push({ index: i, atMs: at, delta: deltas[i], rule: 'spike' });
      }
    }
  }
  const outside = deltas.filter((_, i) => {
    const at = times[i + 1];
    return !windows.some((w) => at >= w.from && at <= w.to);
  });
  const maxOutside = outside.length ? Math.max(...outside) : 0;

  // S#32 on the timeline axis.
  const lums = luminanceSeries(imgs);
  const axis = times.map((t) => (t < m.cover ? t - m.cover : (t - m.cover) / k));
  const jumps = detectLuminanceJumps(axis, lums, {
    threshold: FLASH_JUMP,
    windowMs: FLASH_WINDOW_MS,
  });
  let maxJump = 0;
  let pairs = 0;
  let covered = 0;
  for (let i = 0; i < axis.length; i++) {
    for (let j = i + 1; j < axis.length && axis[j] - axis[i] <= FLASH_WINDOW_MS; j++) {
      maxJump = Math.max(maxJump, Math.abs(lums[j] - lums[i]));
    }
    if (i + 1 < axis.length) {
      pairs++;
      if (axis[i + 1] - axis[i] <= FLASH_WINDOW_MS) covered++;
    }
  }

  return {
    frames: inRun.length,
    k,
    gate,
    medianDelta: med,
    maxDelta: maxOutside,
    ratio: maxOutside / med,
    cuts,
    windows,
    jumps,
    maxJump,
    coverage: pairs ? covered / pairs : 0,
    frameIntervalMs: fi,
    done: done?.detail,
  };
}

function line(a) {
  return `frames ${a.frames}, k ${fmt(a.k, 1)}, median Δ ${fmt(a.medianDelta, 5)}, max Δ outside fades ${fmt(a.maxDelta, 5)} = ${fmt(a.ratio, 2)}x median (limit ${CUT_RATIO}x), cuts ${a.cuts.length}; luminance: max 100 ms jump ${fmt(a.maxJump, 3)} (limit ${FLASH_JUMP}), pair coverage ${fmt(a.coverage * 100)} %`;
}

function assertSmooth(label, a) {
  if (a.cuts.length) {
    const c = a.cuts[0];
    throw new Fail(
      `S#31 (${label}): ${a.cuts.length} hard cut(s); first at ${fmt(c.atMs)} ms (page clock), Δ ${fmt(c.delta, 5)} = ${fmt(c.delta / a.medianDelta, 1)}x the run's median ${fmt(a.medianDelta, 5)} [${c.rule} rule]`,
    );
  }
  if (a.jumps.length) {
    const j = a.jumps[0];
    throw new Fail(
      `S#32 (${label}): luminance changed by ${fmt(j.jump, 3)} (> ${FLASH_JUMP}) within ${FLASH_WINDOW_MS} ms of timeline between ${fmt(j.fromMs)} and ${fmt(j.toMs)} ms`,
    );
  }
}

/* ── Scenarios ────────────────────────────────────────────────────────────── */

async function uninterrupted(ctx, state) {
  const app = await freshApp(ctx);
  const run = await recordedRun(app, { href: '/games' });
  const a = await analyse(run);
  state.k0 = a.k;
  report.scenarios.push({ ...ctx.tag, scenario: 'uninterrupted', ...strip(a) });
  ctx.numbers.push(`(a) uninterrupted: ${line(a)}`);
  assertSmooth('uninterrupted', a);
  return app;
}

async function fastForwards(ctx, state, app) {
  const rand = rng(SEED);
  const instants = Array.from(
    { length: FF_RUNS },
    () => FF_INSTANT_RANGE[0] + rand() * (FF_RUNS ? FF_INSTANT_RANGE[1] - FF_INSTANT_RANGE[0] : 0),
  );
  ctx.numbers.push(
    `(b) fast-forward instants (timeline ms, seed ${SEED}): ${instants.map((t) => fmt(t)).join(' ')}`,
  );
  let worst = 0;
  for (let i = 0; i < instants.length; i++) {
    const href = HREFS[i % HREFS.length];
    const run = await recordedRun(app, { href, ffAtTimeline: instants[i], k0: state.k0 ?? 1 });
    const a = await analyse(run);
    worst = Math.max(worst, a.ratio);
    report.scenarios.push({
      ...ctx.tag,
      scenario: 'fast-forward',
      at: instants[i],
      ffAt: run.acted.ffAt ?? null,
      ...strip(a),
    });
    ctx.numbers.push(`(b) #${i + 1} ff@${fmt(instants[i])} ms → ${href}: ${line(a)}`);
    if (run.acted.ffAt === undefined) {
      throw new Fail(
        `S#31 (fast-forward #${i + 1}): the run had already finished at the chosen instant (${fmt(instants[i])} ms timeline) — the rig's k drifted; rerun`,
      );
    }
    assertSmooth(`fast-forward #${i + 1} at ${fmt(instants[i])} ms`, a);
  }
  ctx.numbers.push(`(b) worst ratio over ${instants.length} runs: ${fmt(worst, 2)}x`);
}

async function delayedDestination(ctx, state) {
  const app = await freshApp(ctx, { dest: 'hold' });
  const run = await recordedRun(app, { href: '/explore', dest: 'hold', destDelayMs: 4000 });
  const a = await analyse(run);
  report.scenarios.push({ ...ctx.tag, scenario: 'delayed-4s', ...strip(a) });
  ctx.numbers.push(`(c) 4 s destination (gate '${a.gate}'): ${line(a)}`);
  assertSmooth('4 s delayed destination', a);
  state.k0 ??= a.k;
}

async function failingDestination(ctx) {
  const app = await freshApp(ctx, { dest: 'fail' });
  const run = await recordedRun(app, { href: '/explore', dest: 'fail' });
  const a = await analyse(run);
  report.scenarios.push({ ...ctx.tag, scenario: 'destination-500', ...strip(a) });
  ctx.numbers.push(`(d) 500 destination (gate '${a.gate}'): ${line(a)}`);
  assertSmooth('500 destination', a);
}

/** The detector must FAIL on a recording with a real, injected hard cut. */
async function selfProof(ctx) {
  const app = await freshApp(ctx, { debug: true });
  const run = await recordedRun(app, { href: '/games', inject: true });
  const a = await analyse(run);
  const injectAt = run.acted.injectAt;
  report.scenarios.push({ ...ctx.tag, scenario: 'self-proof', injectAt, ...strip(a) });
  ctx.numbers.push(`(prove) injected radius step at ${fmt(injectAt)} ms: ${line(a)}`);
  if (injectAt === undefined) throw new Fail('S#31 (self-proof): the hard cut was never injected');
  if (!a.cuts.length) {
    throw new Fail(
      `S#31 (self-proof): the detector did NOT flag the injected hard cut (max Δ ${fmt(a.maxDelta, 5)} = ${fmt(a.ratio, 2)}x median, limit ${CUT_RATIO}x). A detector that passes a visible 30 % radius jump proves nothing — the thresholds or the windows are wrong`,
    );
  }
  const near = a.cuts.find(
    (c) => c.atMs >= injectAt - 50 && c.atMs <= injectAt + 6 * a.frameIntervalMs + 500,
  );
  if (!near) {
    throw new Fail(
      `S#31 (self-proof): the detector flagged cuts at ${a.cuts.map((c) => fmt(c.atMs)).join(', ')} ms but none near the injection (${fmt(injectAt)} ms)`,
    );
  }
  ctx.numbers.push(
    `(prove) detector flagged the injected cut at ${fmt(near.atMs)} ms: Δ ${fmt(near.delta, 5)} = ${fmt(near.delta / a.medianDelta, 1)}x median — detector works on the real pipeline`,
  );
}

function strip(a) {
  const { windows, jumps, cuts, ...rest } = a;
  return {
    ...rest,
    cuts: cuts.map((c) => ({ atMs: c.atMs, delta: c.delta, rule: c.rule })),
    windows: windows.map((w) => ({ name: w.name, from: Math.round(w.from), to: Math.round(w.to) })),
    jumps: jumps.length,
  };
}

/* ── Plan ─────────────────────────────────────────────────────────────────── */

const firstTheme = THEMES_RUN[0];
const plan = [];
for (const profile of PROFILES_RUN) {
  for (const theme of THEMES_RUN) {
    const primary = theme === firstTheme;
    plan.push({ profile, theme, primary });
  }
}

console.log(
  `eversion-smoothness: ${BASE_URL} profiles=${PROFILES_RUN} themes=${THEMES_RUN} ff-runs=${FF_RUNS} seed=${SEED}${QUICK ? ' (quick)' : ''}`,
);

browser = await launchBrowser();
for (const item of plan) {
  const name = `${item.profile}/${item.theme}`;
  const ctx = {
    profile: item.profile,
    theme: item.theme,
    tag: { profile: item.profile, theme: item.theme },
    sessions: [],
    numbers: [],
  };
  const state = {};
  const steps = [];
  if (wants('a') || (item.primary && (wants('b') || wants('c') || wants('d')))) {
    steps.push(['(a) uninterrupted', async () => (state.app = await uninterrupted(ctx, state))]);
  }
  if (item.primary) {
    if (wants('b'))
      steps.push([
        `(b) ${FF_RUNS} fast-forwards`,
        async () => fastForwards(ctx, state, state.app ?? (state.app = await freshApp(ctx))),
      ]);
    if (wants('c'))
      steps.push(['(c) 4 s delayed destination', () => delayedDestination(ctx, state)]);
    if (wants('d')) steps.push(['(d) 500 destination', () => failingDestination(ctx)]);
    if (PROVE && wants('prove') && item.profile === PROFILES_RUN[0]) {
      steps.push(['(prove) detector self-proof', () => selfProof(ctx)]);
    }
  }
  for (const [label, fn] of steps) {
    const t0 = performance.now();
    let failure = null;
    try {
      await fn();
    } catch (e) {
      failure = e instanceof Fail ? e.message : `S#31: unexpected ${e?.message ?? e}`;
    }
    const secs = Math.round((performance.now() - t0) / 1000);
    results.push({ name, label, ok: !failure, failure, secs });
    console.log(`${failure ? 'FAIL' : 'PASS'} ${label} [${name}] (${secs} s)`);
    for (const n of ctx.numbers.splice(0)) console.log(`     ${n}`);
    if (failure) console.log(`     ${failure}`);
  }
  for (const s of ctx.sessions) await s.close().catch(() => {});
  await sleep(0);
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
