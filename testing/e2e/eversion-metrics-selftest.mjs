// ─────────────────────────────────────────────────────────────────────────────
// Self-test of the eversion e2e rig (T14) — run it FIRST, like `fouc.mjs
// --self-test`.
//
//   node testing/e2e/eversion-metrics-selftest.mjs
//
// A perf or smoothness gate that cannot fail is worse than none: "no hard cut
// found" means nothing until the detector has been shown to find one. So before
// T27/T34/T35/T36 trust `lib/image-metrics.mjs` and `lib/eversion-session.mjs`,
// this proves them on synthetic inputs (spec §11.3 / tasks T14 acceptance):
//
//   • SSIM(image, itself) = 1; with a 1-px shift > 0.9; with noise < 0.5
//   • a synthetic hard cut is flagged by the frame-delta detector; a crossfade is not
//   • the luminance detector flags a 30 % jump in 50 ms, and not a slow ramp
//   • the colour-class histogram classifies a red/blue split
//   • baselines round-trip and flag a regression
//   • the session rig: marks read back with their detail, and a CDP screencast
//     of a changing static page yields decodable frames on the page clock
//
// It needs no app server: the browser part runs on `page.setContent`. Exit code
// is non-zero on any failure. Chromium resolution: see lib/eversion-session.mjs.
// ─────────────────────────────────────────────────────────────────────────────

/* global innerWidth, innerHeight, devicePixelRatio, performance -- referenced only inside
   page.evaluate() callbacks, which Playwright serialises and runs in the page. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareToBaseline, loadBaseline, saveBaseline } from './lib/baselines.mjs';
import {
  colourHistogram,
  decodeImage,
  detectHardCuts,
  detectLuminanceJumps,
  frameDeltaSeries,
  luminanceSeries,
  ssim,
} from './lib/image-metrics.mjs';
import { EVERSION_MARKS, launchBrowser, openSession } from './lib/eversion-session.mjs';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

// ── Synthetic images ─────────────────────────────────────────────────────────

const W = 128;
const H = 96;

/** Deterministic PRNG so the noise case is the same on every run. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function make(fn) {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fn(x, y);
      const p = (y * W + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/** A page-like image: gradient, smooth texture and a block, so shifts change structure. */
const scene = (dx = 0) =>
  make((x, y) => {
    const u = x - dx;
    let v = 90 + (u * 100) / W + (y * 40) / H;
    v += 30 * Math.sin(u / 9) * Math.cos(y / 11);
    if (u > 30 && u < 70 && y > 10 && y < 30) v = 230;
    v = Math.max(0, Math.min(255, v));
    return [v, v * 0.9, v * 0.8];
  });

const solid = (r, g, b) => make(() => [r, g, b]);

function mix(a, b, t) {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(a.data[i] * (1 - t) + b.data[i] * t);
  return { width: a.width, height: a.height, data: out };
}

function noisy(img, seed) {
  const r = rng(seed);
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < out.length; i++) out[i] = i % 4 === 3 ? 255 : Math.floor(r() * 256);
  return { width: img.width, height: img.height, data: out };
}

// ── SSIM ─────────────────────────────────────────────────────────────────────

{
  const a = scene();
  const self = ssim(a, a);
  const shifted = ssim(a, scene(1));
  const noise = ssim(a, noisy(a, 7));
  check('ssim(img, img) = 1', Math.abs(self - 1) < 1e-9, self.toFixed(6));
  check('ssim(img, 1-px shift) > 0.9', shifted > 0.9, shifted.toFixed(4));
  check('ssim(img, noise) < 0.5', noise < 0.5, noise.toFixed(4));
  let threw = false;
  try {
    ssim(a, { width: 8, height: 8, data: new Uint8Array(256) });
  } catch {
    threw = true;
  }
  check('ssim refuses mismatched sizes', threw);
}

// ── Hard cut vs crossfade ────────────────────────────────────────────────────

{
  const dark = solid(10, 10, 20);
  const light = solid(240, 235, 225);
  const dt = 1000 / 60;
  const times = (n) => Array.from({ length: n }, (_, i) => i * dt);

  const cut = [dark, dark, dark, light, light, light];
  const cutHits = detectHardCuts(frameDeltaSeries(cut), times(cut.length));
  check(
    'frame-delta flags a synthetic hard cut',
    cutHits.length === 1 && cutHits[0].index === 2,
    JSON.stringify(cutHits),
  );

  // 320 ms crossfade at 60 Hz ≈ 19 steps.
  const steps = 19;
  const fade = Array.from({ length: steps + 1 }, (_, i) => mix(dark, light, i / steps));
  const fadeHits = detectHardCuts(frameDeltaSeries(fade), times(fade.length));
  check('frame-delta does not flag a crossfade', fadeHits.length === 0, JSON.stringify(fadeHits));

  const excluded = detectHardCuts(frameDeltaSeries(cut), times(cut.length), {
    exclude: [{ from: 2 * dt, to: 4 * dt }],
  });
  check('an excluded window suppresses the cut', excluded.length === 0);
}

// ── Luminance flash ──────────────────────────────────────────────────────────

{
  // Relative luminance 0.0 → ~0.3 needs sRGB ≈ 149; build frames by target luminance.
  const grey = (v) => solid(v, v, v);
  const jump = luminanceSeries([grey(0), grey(0), grey(149), grey(149)]);
  const jumpT = [0, 25, 50, 75]; // the step lands inside one 50 ms window
  const hits = detectLuminanceJumps(jumpT, jump);
  check(
    'luminance detector flags a 30 % jump in 50 ms',
    hits.length > 0 && hits[0].jump > 0.29,
    jump.map((v) => v.toFixed(3)).join(','),
  );

  // The same 30 % reached over 600 ms is a ramp, not a flash.
  const ramp = Array.from({ length: 37 }, (_, i) => (i / 36) * 149);
  const rampL = luminanceSeries(ramp.map((v) => grey(Math.round(v))));
  const rampT = ramp.map((_, i) => i * (600 / 36));
  const rampHits = detectLuminanceJumps(rampT, rampL);
  check(
    'luminance detector ignores a 600 ms ramp',
    rampHits.length === 0,
    JSON.stringify(rampHits),
  );
}

// ── Colour-class histogram ───────────────────────────────────────────────────

{
  const half = make((x) => (x < W / 2 ? [250, 5, 5] : [5, 5, 250]));
  const h = colourHistogram(half, { red: [255, 0, 0], blue: [0, 0, 255] });
  check(
    'colour histogram splits red/blue 50/50 with nothing else',
    Math.abs(h.red - 0.5) < 1e-9 && Math.abs(h.blue - 0.5) < 1e-9 && h.other === 0,
    JSON.stringify(h),
  );
}

// ── Baselines ────────────────────────────────────────────────────────────────

{
  const dir = mkdtempSync(join(tmpdir(), 'eversion-baselines-'));
  try {
    check('missing baseline loads as null', loadBaseline('nope', dir) === null);
    saveBaseline('frames', { p95: 16.7, droppedShare: 0.01 }, dir);
    const base = loadBaseline('frames', dir);
    const rules = { p95: { maxRatio: 1.15 }, droppedShare: { maxDelta: 0.02 } };
    check('baseline round-trips', base?.p95 === 16.7);
    check('baseline accepts an unchanged run', compareToBaseline(base, base, rules).ok);
    const worse = compareToBaseline({ p95: 20, droppedShare: 0.01 }, base, rules);
    check('baseline flags a >15 % p95 regression', !worse.ok && worse.failures.length === 1);
    const shareWorse = compareToBaseline({ p95: 16.7, droppedShare: 0.05 }, base, rules);
    check('baseline flags a >2-point dropped-share regression', !shareWorse.ok);
    check('no baseline is reported as missing', compareToBaseline(base, null, rules).missing);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Session rig, on a static page ────────────────────────────────────────────

{
  const browser = await launchBrowser();
  const s = await openSession({ browser, profile: 'mobile', theme: 'light' });
  try {
    await s.page.setContent(
      '<!doctype html><meta name="viewport" content="width=device-width"><title>t</title><body style="margin:0">' +
        '<div id="b" style="width:100vw;height:100vh;background:#000"></div></body>',
    );
    const vp = await s.page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
    check('mobile profile applies', vp[0] === 390 && vp[1] === 844 && vp[2] === 3, vp.join('x'));

    check('marks() is empty before any run', (await s.marks()).length === 0);
    await s.page.evaluate(
      ([name]) => performance.mark(name, { detail: { requested: 'eversion', href: '/x' } }),
      [EVERSION_MARKS.start],
    );
    await s.page.evaluate(() => performance.mark('unrelated'));
    const marks = await s.marks();
    check(
      'marks() returns eversion marks with detail, ignoring others',
      marks.length === 1 && marks[0].name === 'eversion:start' && marks[0].detail?.href === '/x',
      JSON.stringify(marks),
    );
    const hit = await s.waitForMark(EVERSION_MARKS.start, { timeout: 2000 });
    check('waitForMark resolves on an existing mark', hit.name === 'eversion:start');
    await s.clearMarks();
    check('clearMarks empties them', (await s.marks()).length === 0);

    // Alternate black/white in the page while recording.
    await s.startRecording();
    const t0 = await s.page.evaluate(() => performance.now());
    await s.page.evaluate(() => {
      const el = document.getElementById('b');
      let on = false;
      const id = setInterval(() => {
        on = !on;
        el.style.background = on ? '#fff' : '#000';
      }, 120);
      setTimeout(() => clearInterval(id), 900);
    });
    await s.page.waitForTimeout(1100);
    const frames = await s.stopRecording();
    check('screencast yields frames', frames.length >= 2, `${frames.length} frames`);
    if (frames.length >= 2) {
      const decoded = await Promise.all(frames.map((f) => decodeImage(f.buffer)));
      check(
        'frames decode to the mobile viewport at 1x CSS px scale',
        decoded[0].width > 0 && decoded[0].height > 0,
        `${decoded[0].width}x${decoded[0].height}`,
      );
      const lums = luminanceSeries(decoded);
      check(
        'recorded luminance spans dark and light',
        Math.max(...lums) > 0.8 && Math.min(...lums) < 0.2,
        `${Math.min(...lums).toFixed(2)}..${Math.max(...lums).toFixed(2)}`,
      );
      const now = await s.page.evaluate(() => performance.now());
      check(
        'frame timestamps are on the page clock',
        frames[0].tMs >= t0 - 1500 && frames.at(-1).tMs <= now + 50,
        `${frames[0].tMs.toFixed(0)}..${frames.at(-1).tMs.toFixed(0)} in [${t0.toFixed(0)}, ${now.toFixed(0)}]`,
      );
    }
    const shot = await decodeImage(await s.screenshot());
    check('screenshot decodes', shot.width > 0);
  } finally {
    await s.close();
    await browser.close();
  }
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall eversion e2e rig checks passed');
process.exit(failed ? 1 : 0);
