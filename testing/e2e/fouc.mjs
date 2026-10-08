// ─────────────────────────────────────────────────────────────────────────────
// The FOUC audit.
//
// A flash of unstyled (or wrongly-styled) content is the one class of defect
// this codebase cannot catch by reading code: every mechanism that prevents it —
// the pre-paint `themeScript`, `localeScript`, `PERF_TIER_SCRIPT` and
// `platformScript` in `app/routes/__root.tsx`, the `--site-*`/`--app-*` token
// contracts, the route-CSS guards in `app/globals.css` — is correct in isolation
// and only provably correct TOGETHER, in a real browser, on a real page, in the
// order the browser actually does things. So this drives the BUILT app with
// Chromium and measures what the document looked like over time.
//
//   # build + serve first (dev mode injects CSS through JS and always flashes —
//   # it tells you nothing about the shipped site)
//   pnpm build && node .output/server/index.mjs
//
//   node testing/e2e/fouc.mjs                       # every page, every profile
//   node testing/e2e/fouc.mjs --quick               # 2 profiles (the CI shape)
//   node testing/e2e/fouc.mjs --route /library      # one page, all profiles
//   node testing/e2e/fouc.mjs --profiles fresh,rtl  # pick profiles
//   node testing/e2e/fouc.mjs --json out.json       # machine-readable report
//   node testing/e2e/fouc.mjs --no-frames           # skip the screencast
//
// ## What it measures, and why each one is a flash
//
// 1. **Ground at first paint vs settled** (`ground`). The document background is
//    the largest coloured surface on screen. `themeScript` exists to get it right
//    before the first frame; when it does not, the visitor sees white-then-black
//    (or the reverse) across the whole viewport. Measured from
//    `getComputedStyle`, not pixels, so the report names the colours.
// 2. **Root restyle after first paint** (`restyle`). Every global visual decision
//    lands on `<html>`: the theme class, `dir`, the accent/surface custom
//    properties, the font scale, `data-density`, `data-color-vision`,
//    `data-app-dark`, `color-scheme`. If one of them MOVES after the first
//    contentful paint, the whole document was repainted in front of the reader.
// 3. **Stylesheets that finish after first paint** (`late-css`). A route whose CSS
//    is not in the SSR `<head>` paints its markup unstyled first. This is the
//    mechanism `app/globals.css`'s `.lib__shelf` guard was written for.
// 4. **Hydration mismatches** (`hydration`). React throws away the server markup
//    and re-renders the subtree — a flash by construction.
// 5. **Layout shift after first paint** (`shift`). The measurable consequence of
//    unstyled content becoming styled.
// 6. **Compositor frames** (`frame`). Real painted frames from
//    `Page.startScreencast`, compared against the settled frame. Content that
//    converges on its final look is normal loading; content that DIVERGES —
//    looks more like the end state at frame N than at frame N+1 — changed
//    appearance after the reader could see it. That is a flash no DOM-level
//    detector can see, because it is about pixels.
//
// Detectors 1-5 are deterministic and gate. Detector 6 gates only on divergence
// past `FRAME_DIVERGENCE_LIMIT`, under reduced motion (see PROFILES), because
// that is the only regime where "the picture changed" is unambiguous.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { INSTRUMENT_SOURCE, SAMPLE_WINDOW_MS } from './fouc-instrument.mjs';
import { collectRoutes, REPO_ROOT } from './fouc-routes.mjs';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const ORIGIN = new URL(BASE_URL).origin;

/**
 * Which Chromium to drive.
 *
 * `PLAYWRIGHT_BROWSERS_PATH` images pin ONE build, and the `playwright` package
 * in `package.json` moves independently of it — so a bare `chromium.launch()`
 * asks for a revision that may not be on disk and tells you to run
 * `playwright install`, which those images deliberately disable. Pointing at the
 * installed binary keeps the audit runnable on a CI image, in the container, and
 * on a laptop that did run `playwright install` (where the path is absent and
 * Playwright resolves its own).
 */
const CHROMIUM_PATH =
  process.env.FOUC_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// ── Thresholds ───────────────────────────────────────────────────────────────

/**
 * How different two grounds have to be before the change counts as a flash.
 *
 * Expressed as a relative-luminance delta (WCAG `L`), not a hex comparison: the
 * settled ground legitimately differs from the pre-paint one by a rounding step
 * when a theme mixes colours (`color-mix` resolves differently once the full
 * sheet is parsed), and a gate that fired on that would be noise. 0.04 is well
 * below any theme pairing in `SITE_STYLES` (Daylight→Midnight is 1.0) and well
 * above rounding.
 */
const GROUND_LUMA_DELTA = 0.04;

/** Layout shift after FCP that counts as "the page restyled under the reader". */
const POST_FCP_CLS_LIMIT = 0.1;

/**
 * Post-paint layout shifts that are measured, understood, and not defects.
 *
 * One-directional, in the same sense as the allowlists in
 * `lib/__tests__/design-consistency.test.ts`: entries come out when the shift is
 * fixed, they do not go in to quiet a finding. An entry must name the element,
 * CAP the value so a worse shift still fails, and say why the shift costs the
 * reader nothing. "Hard to fix" is not such a reason.
 *
 * Empty since 2026-10-07. Its one entry was `/laundry-sort` at 0.443 — a 16:9
 * stage that was 0x0 in the server HTML until a ResizeObserver measured it. The
 * stage is now sized by CSS from first paint (container-query units, see
 * `components/laundry-sort/AspectStage.tsx`) and measures 0 in every profile.
 * Keep the list: the next entry needs the same evidence that one carried.
 */
const KNOWN_SHIFTS = [];

/**
 * How far a frame may DIVERGE from the settled frame relative to its
 * predecessor before it counts as a visible change of appearance. 0.06 = 6% mean
 * absolute luma difference on the downscaled signature; a theme/ground flash
 * measures 0.3-1.0 and progressive image loading measures under 0.02 because it
 * only ever converges.
 */
const FRAME_DIVERGENCE_LIMIT = 0.06;

/**
 * How different the picture may still be from its settled state one second after
 * content first appeared.
 *
 * Set from measurement, not taste. Across a representative slice of the site most
 * pages measure EXACTLY 0.0000 — they paint their settled look and never move
 * again — and the two that do move are the ones still fetching content: the feed
 * at `/` (0.0227, settled at +745ms) and `/isleworks` (0.0093, +621ms). A
 * deliberate flash measures 0.80. 0.08 sits an order of magnitude above the
 * content-arrival noise and an order of magnitude below a real flash.
 *
 * Re-derive it with `FOUC_DEBUG=1`, which prints the per-frame distance series.
 */
const FRAME_LATE_SETTLE_LIMIT = 0.08;

/**
 * Above this much residual frame-to-frame change in the last quarter of the
 * capture, the page counts as STILL ANIMATING and the pixel detector stands down
 * to a note.
 *
 * It has to. Its whole method is "compare every frame against the settled one",
 * and an animating page has no settled one — the last frame is just where the
 * capture stopped. Dunesday boots through a Windows-7 splash and GlobeSet spins a
 * liquid globe; both reported divergence that was the animation, not a flash.
 * 0.004 is an order of magnitude under the 0.06 divergence gate and well above the
 * ~0.000 a genuinely static page measures.
 *
 * Standing down costs less than it looks: the root-level detectors (ground, theme
 * class, direction, fonts, tokens, `data-app-dark`) read `getComputedStyle`, not
 * pixels, and they keep gating on these pages.
 */
const FRAME_ANIMATING_LIMIT = 0.004;

/** A frame is "content bearing" once it stops being a single flat colour. */
const FRAME_CONTENT_VARIANCE = 0.0015;

// ── Appearance profiles ──────────────────────────────────────────────────────

/**
 * A FOUC is preference-dependent: the pre-paint script's whole job is to read a
 * stored preference and apply it, so a bug in it is invisible to a visitor with
 * no preferences at all. Each profile is one stored-preference shape.
 *
 * All but `motion` run with `reducedMotion: 'reduce'`. That is not a hedge — it
 * is what makes detector 6 meaningful. `app/globals.css` collapses every
 * transition and enter animation to 0.01ms under that preference, so the only
 * thing left that can change the picture after first paint is a restyle, which
 * is exactly what the audit is looking for. `motion` covers the same ground with
 * animations on, and reports frame divergence without gating on it.
 */
export const PROFILES = {
  fresh: {
    why: 'A first-ever visitor: nothing stored, light OS. The default path through themeScript.',
    localStorage: {},
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  graphite: {
    why: 'Midnight stored. The pre-paint script must add `style-graphite` and paint #000 before frame 1.',
    localStorage: { 'rmh-style': 'graphite' },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  },
  'high-contrast': {
    why: 'The high-contrast theme, which also suppresses the user-theme override path.',
    localStorage: { 'rmh-style': 'high-contrast' },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  },
  'os-dark': {
    why: 'No stored theme but a dark OS. Catches a page that follows prefers-color-scheme while the document ground does not.',
    localStorage: {},
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  },
  comfort: {
    why: 'Every root-level accessibility knob at once — font scale, compact density, readable font, reduced transparency, colour-vision filter. Each one is a different <html> attribute the pre-paint script has to set, and any it misses restyles the document after hydration.',
    localStorage: {
      'rmh-style': 'graphite',
      'rmh-font-scale': '1250',
      'rmh-density': 'compact',
      'rmh-readable-font': '1',
      'rmh-glass-level': '0',
      'rmh-reduce-transparency': '1',
      'rmh-color-vision': 'deuteranopia',
      'rmh-accent': 'rose',
    },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  },
  'app-light': {
    why: "The app tier's light grounds. Slice It and the PF2e board persist their own light/dark, and APP_ROUTE_THEME_BG is how the pre-paint script learns which. Stored LIGHT here because light-under-a-dark-default is the direction that flashes.",
    localStorage: {
      'slice-it-storage': JSON.stringify({ state: { isDarkMode: false }, version: 0 }),
      'pf2ecal-theme': JSON.stringify({ state: { dark: false }, version: 0 }),
      'sohumtracker-theme': JSON.stringify({ state: { dark: false }, version: 0 }),
    },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  rtl: {
    why: 'Arabic. `dir` has to be on <html> before the body paints or the whole layout mirrors in front of the reader.',
    localStorage: {},
    cookies: [{ name: 'rmh-lang', value: 'ar' }],
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  motion: {
    why: 'Midnight with animations ON. Frame divergence is reported but not gated here, because an intro animation legitimately changes the picture.',
    localStorage: { 'rmh-style': 'graphite' },
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    framesGate: false,
  },
  'signed-in': {
    why: 'A signed-in visitor. Without this the audit reports ~40 clean pages it never saw: /settings/*, /messages, /saves, /admin/* and the rest all 307 away from a signed-out run, so they were audited as whatever they redirect to. The session is provisioned against the audited server — see provisionSession.',
    localStorage: { 'rmh-style': 'graphite' },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    auth: 'session',
  },
};

/** The profile pair CI runs: one light/empty, one dark/stored. */
const QUICK_PROFILES = ['fresh', 'graphite'];

/**
 * CPU throttling applied to every run, as a slowdown multiplier.
 *
 * 4x is Lighthouse's mobile default and it is here for the same reason: the
 * interesting ordering — markup painting before the thing that styles it arrives —
 * only happens when the machine is slow enough for the two to be distinguishable.
 * Unthrottled, the audit's own results were not reproducible run to run.
 *
 * `--throttle 1` turns it off, which is useful when you want to know whether a
 * flash is visible on fast hardware too; it is never the right setting for
 * deciding that a page is clean.
 */
const DEFAULT_CPU_THROTTLE = 4;

// ── Sessions ─────────────────────────────────────────────────────────────────

/**
 * Sign in to the audited server and return its session cookies.
 *
 * A signed-out run cannot audit a signed-in page: `/settings/*`, `/messages`,
 * `/saves`, `/admin/*` and about forty others answer a signed-out request with a
 * 307 to `/` or `/login`. Before this existed the audit called every one of them
 * clean, having loaded the home page instead — the worst possible failure for an
 * audit, because it is indistinguishable from success.
 *
 * It provisions through the site's own HTTP API rather than the database, so the
 * audit needs no Prisma client, no schema knowledge and no credentials beyond the
 * ones it creates. The account is a throwaway with an `.invalid` address (reserved
 * by RFC 2606, so it can never collide with or mail a real one).
 *
 * **This writes to the server it audits.** That is correct for a local build or a
 * CI container and wrong for anything shared, so it only runs when a profile asks
 * for it, and `--no-auth` turns it off and skips those profiles. `/admin/*` needs
 * a flag no HTTP endpoint can grant: pass a ready-made cookie in
 * `FOUC_SESSION_COOKIE` (`name=value; name=value`) to audit those as themselves.
 */
const AUDIT_ACCOUNT = {
  email: 'fouc-audit@example.invalid',
  password: 'FoucAudit!2026x',
  name: 'FOUC Audit',
};

function parseCookieHeader(raw) {
  return raw
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
    })
    .filter((c) => c.name && c.value);
}

let sessionCookiesPromise = null;

async function provisionSession() {
  if (process.env.FOUC_SESSION_COOKIE) {
    return parseCookieHeader(process.env.FOUC_SESSION_COOKIE);
  }

  const post = async (path) =>
    fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(AUDIT_ACCOUNT),
    });

  // Sign up first; an existing account makes that fail, and sign-in is then the
  // right call. Doing it in this order means a fresh database needs no setup step.
  let response = await post('/api/auth/sign-up/email');
  if (!response.ok) response = await post('/api/auth/sign-in/email');
  if (!response.ok) {
    throw new Error(
      `could not provision a session (${response.status}). Pass FOUC_SESSION_COOKIE instead, or run with --no-auth.`,
    );
  }

  const cookies = [];
  for (const header of response.headers.getSetCookie?.() ?? []) {
    const [pair] = header.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) cookies.push({ name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() });
  }
  if (!cookies.length) throw new Error('sign-in succeeded but set no cookies');
  return cookies;
}

function sessionCookies() {
  sessionCookiesPromise ??= provisionSession();
  return sessionCookiesPromise;
}

// ── Colour helpers ───────────────────────────────────────────────────────────

function parseColor(value) {
  if (!value) return null;
  const m = String(value).match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i,
  );
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

function relativeLuminance(c) {
  if (!c) return null;
  const lin = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function groundDelta(a, b) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a === b ? 0 : 1;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  // Alpha counts: transparent → opaque over the same hue is still a visible change.
  return Math.max(Math.abs(la - lb), Math.abs(ca.a - cb.a));
}

// ── Frame analysis ───────────────────────────────────────────────────────────

/**
 * Reduce each screencast frame to a 24x48 luma signature and a variance, inside
 * a scratch page.
 *
 * The decoding happens in the browser because that is the only JPEG decoder in
 * reach without adding a dependency — the smoke suite's rule, kept: the audit
 * runs on `playwright` and nothing else.
 */
const FRAME_ANALYZER = `async (frames) => {
  const W = 24, H = 48;
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const out = [];
  for (const f of frames) {
    const blob = await (await fetch('data:image/jpeg;base64,' + f.data)).blob();
    const bmp = await createImageBitmap(blob);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bmp, 0, 0, W, H);
    bmp.close();
    const { data } = ctx.getImageData(0, 0, W, H);
    const luma = new Array(W * H);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      luma[p] = l;
      sum += l;
    }
    const mean = sum / luma.length;
    let variance = 0;
    for (const l of luma) variance += (l - mean) * (l - mean);
    variance /= luma.length;
    out.push({ t: f.t, luma, mean, variance });
  }
  return out;
}`;

/**
 * How many captured frames to decode per run.
 *
 * The screencast delivers ~70 frames over the 4s window. Decoding all of them,
 * four workers at a time, is what turned a whole-site pass from minutes into
 * hours; 48 evenly-spaced frames resolve a flash to ~85ms, which is far finer
 * than anything a reader perceives as a single event.
 */
const FRAME_ANALYSIS_BUDGET = 48;

/**
 * How many of those frames the filmstrip renders.
 *
 * The analysis wants resolution; a human looking at a strip wants to see the
 * sequence. 16 evenly-spaced frames across the window read as a sequence at a
 * glance and keep the page openable — every frame is inlined as a data URI, so 48
 * per row across twenty routes is a 15 MB document nobody scrolls twice.
 */
const FILMSTRIP_FRAME_BUDGET = 16;

/** Evenly thin a frame list to `budget`, always keeping the first and last. */
function subsampleFrames(frames, budget) {
  if (frames.length <= budget) return frames;
  const out = [];
  const step = (frames.length - 1) / (budget - 1);
  for (let i = 0; i < budget; i++) out.push(frames[Math.round(i * step)]);
  return out;
}

/**
 * One scratch page per browser context, reused across that context's runs.
 *
 * It exists only to hold a JPEG decoder: the frames come back from CDP as base64
 * and the only decoder within reach without adding a dependency is the browser's
 * own (`createImageBitmap` + OffscreenCanvas). Opening a fresh page for every run
 * cost more than the decode did.
 */
const analyzerPages = new WeakMap();
async function analyzerPage(context) {
  let page = analyzerPages.get(context);
  if (!page || page.isClosed()) {
    page = await context.newPage();
    analyzerPages.set(context, page);
  }
  return page;
}

function meanAbsDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Turn a frame timeline into the one number that matters: the largest amount by
 * which a content-bearing frame moved AWAY from the settled picture relative to
 * the frame before it.
 *
 * Loading converges — each frame looks more like the end than the last, so the
 * series of `diff(frame_i, final)` decreases. A flash is the opposite: a frame
 * that looks LESS like the final picture than its predecessor did. That makes
 * the detector blind to progressive rendering (which is not a defect) and
 * sensitive to restyles (which are).
 */
function analyseFrames(stats) {
  if (stats.length < 3) return null;
  const final = stats[stats.length - 1];
  const firstContent = stats.findIndex((s) => s.variance > FRAME_CONTENT_VARIANCE);
  if (firstContent < 0) return { divergence: 0, frames: stats.length, firstContentAt: null };

  const t0 = stats[firstContent].t;
  const series = [];
  for (let i = firstContent; i < stats.length; i++) {
    series.push({
      t: stats[i].t,
      dt: (stats[i].t - t0) * 1000,
      diff: meanAbsDiff(stats[i].luma, final.luma),
    });
  }

  // (a) Divergence: a frame that looks LESS like the settled picture than its
  //     predecessor did. Only a transient flash does this, so it is cheap to
  //     gate on — progressive loading only ever converges.
  let divergence = 0;
  let divergeAt = null;
  for (let i = 1; i < series.length; i++) {
    const delta = series[i].diff - series[i - 1].diff;
    if (delta > divergence) {
      divergence = delta;
      divergeAt = series[i].t;
    }
  }

  // (b) Late settle: how different the picture still was from its final state a
  //     while after content first appeared. This is the half that catches a
  //     PERMANENT late change — a component adding a visual class from an effect,
  //     a late font, a panel that drops in — which (a) cannot see, because by the
  //     end state it has converged.
  // The worst the picture still looked at any point from 400ms after content
  // first appeared. 400ms is the grace period: below it a page is legitimately
  // mid-paint, above it a reader has been looking at something.
  let maxUnsettled = 0;
  let maxUnsettledAtMs = 0;
  for (const row of series) {
    if (row.dt < 400) continue;
    if (row.diff > maxUnsettled) {
      maxUnsettled = row.diff;
      maxUnsettledAtMs = row.dt;
    }
  }

  // (b2) Was the page still moving when the window closed? A page with a
  //      deliberate intro — a boot splash, a spinning globe, a game loop — never
  //      reaches a settled state, and then "the settled picture" is just one frame
  //      of an animation and every comparison against it is meaningless. Measured
  //      as the mean consecutive-frame change over the last quarter of the capture.
  const tail = series.slice(Math.floor(series.length * 0.75));
  let stillMoving = 0;
  if (tail.length > 1) {
    let sum = 0;
    for (let i = 1; i < tail.length; i++) sum += Math.abs(tail[i].diff - tail[i - 1].diff);
    stillMoving = sum / (tail.length - 1);
  }

  // (c) When the picture actually stopped moving: the first frame from which
  //     every later frame is within 2% of the settled one.
  let settledFromMs = null;
  for (let i = 0; i < series.length; i++) {
    if (series.slice(i).every((r) => r.diff < 0.02)) {
      settledFromMs = Math.round(series[i].dt);
      break;
    }
  }

  // FOUC_DEBUG=1 prints the raw per-frame distance from the settled picture. It
  // is how FRAME_LATE_SETTLE_LIMIT was calibrated and how you re-calibrate it.
  if (process.env.FOUC_DEBUG) {
    console.log(
      '[frames]',
      series.map((r) => `${Math.round(r.dt)}:${r.diff.toFixed(3)}`).join(' '),
    );
  }
  return {
    frames: stats.length,
    firstContentAt: stats[firstContent].t,
    divergence,
    divergeAt,
    maxUnsettled,
    maxUnsettledAtMs,
    stillMoving,
    settledFromMs,
  };
}

// ── The per-page audit ───────────────────────────────────────────────────────

/** Root-level properties whose change after FCP restyles the whole document. */
const RESTYLE_KEYS = [
  ['ground', 'document background'],
  ['cls', '<html> class (theme / transparency / readable-font)'],
  ['dir', '<html> dir (layout direction)'],
  ['colorScheme', 'color-scheme (form controls, scrollbars)'],
  ['fontFamily', 'root font family'],
  ['fontSize', 'root font size (font-scale)'],
  ['accent', '--site-accent'],
  ['surface', '--site-surface'],
  ['appDark', 'data-app-dark (app-tier light/dark)'],
  ['density', 'data-density'],
];

function sampleAt(samples, t) {
  let found = null;
  for (const s of samples) {
    if (s.t <= t) found = s;
    else break;
  }
  return found ?? samples[0] ?? null;
}

async function auditPage({
  browser,
  target,
  profileName,
  profile,
  captureFrames,
  sabotage,
  throttle,
  filmstrip,
  windowMs = SAMPLE_WINDOW_MS,
}) {
  const url = `${BASE_URL}${target.url}`;
  const findings = [];
  const notes = [];

  const authCookies = profile.auth ? await sessionCookies() : [];
  const context = await browser.newContext({
    colorScheme: profile.colorScheme,
    reducedMotion: profile.reducedMotion,
    viewport: { width: 1280, height: 900 },
    storageState: {
      cookies: [...(profile.cookies ?? []), ...authCookies].map((c) => ({
        ...c,
        domain: new URL(ORIGIN).hostname,
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      })),
      origins: Object.keys(profile.localStorage).length
        ? [
            {
              origin: ORIGIN,
              localStorage: Object.entries(profile.localStorage).map(([name, value]) => ({
                name,
                value,
              })),
            },
          ]
        : [],
    },
  });

  const consoleErrors = [];
  const pageErrors = [];
  let page;
  let frames = [];
  let cdp = null;

  try {
    page = await context.newPage();
    // Before the instrument: it reads this to decide whether to run the
    // compositor heartbeat, which is only worth its CPU when frames are captured.
    await page.addInitScript(
      `window.__foucCaptureFrames = ${captureFrames ? 'true' : 'false'}; window.__foucWindowMs = ${windowMs};`,
    );
    await page.addInitScript(INSTRUMENT_SOURCE);
    // --self-test only: a deliberate post-paint restyle, injected AFTER the
    // instrument so the audit is measuring a real flash rather than its own
    // scaffolding. See `selfTest`.
    if (sabotage) await page.addInitScript(sabotage);

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 600));
    });
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 600)));

    // CPU throttling, applied before navigation.
    //
    // This is not a nicety, it is what makes the audit REPRODUCIBLE. An unthrottled
    // modern machine resolves a lazy route chunk so fast that it often lands before
    // first contentful paint, and a flash that never gets a frame is a flash the
    // audit cannot see. Measured: `/daily/lights-out` reported 0.182 of post-paint
    // layout shift in one run and nothing at all in the next, on the same build —
    // the difference was only how loaded the box was.
    //
    // Throttling makes the slow path the path under test, which is also the path a
    // real visitor on a mid-range phone is on. A FOUC audit that only exercises the
    // fast path systematically under-reports, so this defaults ON.
    if (throttle && throttle > 1) {
      cdp ??= await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    }

    if (captureFrames) {
      cdp ??= await context.newCDPSession(page);
      cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
        frames.push({ data, t: metadata.timestamp });
        try {
          await cdp.send('Page.screencastFrameAck', { sessionId });
        } catch {
          // The session closes while frames are still in flight on a fast page.
        }
      });
      await cdp.send('Page.enable');
      // 30fps at 320px wide. A flash lasts hundreds of milliseconds, so every
      // other frame still samples it a dozen times over, and the halved frame
      // volume is what makes a whole-site pass finish: the capture, the CDP
      // transfer and the JPEG decode are the audit's dominant cost.
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 50,
        maxWidth: 320,
        maxHeight: 640,
        everyNthFrame: 3,
      });
    }

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'commit', timeout: 45_000 });
    } catch (error) {
      findings.push({ kind: 'navigation', detail: `navigation failed: ${error.message}` });
      return { findings, notes, status: 0 };
    }

    const status = response?.status() ?? 0;
    // `page.goto` follows redirects, so `status` is the status of whatever the
    // browser ENDED on. A signed-out run is sent away from every /admin page, and
    // without this the audit would report 30 clean admin pages while having
    // actually loaded the home page 30 times. The landing path is recorded and
    // reported as a coverage caveat, never as a FOUC finding — the redirect is not
    // a defect, the silence about it would be.
    const landedOn = new URL(page.url()).pathname;

    // Let the sampler run its full window: the restyles this audit hunts for
    // land after hydration, after the i18n backfill, and after any store
    // rehydration — all of which are well past `load`.
    await page.waitForTimeout(windowMs + 250);

    if (cdp) {
      try {
        await cdp.send('Page.stopScreencast');
      } catch {
        // ignore
      }
    }

    const state = await page.evaluate(() => {
      const S = window.__fouc;
      if (!S) return null;
      S.sampling = false;
      return {
        samples: S.samples,
        fcp: S.fcp,
        lcp: S.lcp,
        loadEnd: S.loadEnd,
        sheets: S.sheets,
        shifts: S.shifts,
        cls: S.cls,
        hydrationErrors: S.hydrationErrors,
        rootMutations: S.rootMutations,
        sheetImpact: S.sheetImpact,
        fontFiles: S.fontFiles,
        fontLoadedAt: S.fontLoadedAt,
        fontSwaps: S.fontSwaps,
      };
    });

    if (!state) {
      findings.push({
        kind: 'instrument',
        detail:
          'window.__fouc never installed — the page replaced the document or blocked the init script.',
      });
      return { findings, notes, status, landedOn };
    }

    // Neither a redirect nor an error page is a FOUC finding; both are coverage
    // notes, so the report can never quietly pass a page it did not visit.
    if (status === 0 || status >= 400) {
      notes.push(`HTTP ${status} — audited the error document the server returned.`);
    }

    const { samples, fcp } = state;
    if (!samples.length) {
      findings.push({ kind: 'instrument', detail: 'no samples recorded' });
      return { findings, notes, status, landedOn };
    }
    if (fcp === null) {
      notes.push(
        'no first-contentful-paint entry — nothing was painted, so the paint-relative detectors are vacuous here.',
      );
      return { findings, notes, status, landedOn, timings: { fcp: null } };
    }

    const atPaint = sampleAt(samples, fcp);
    const settled = samples[samples.length - 1];

    // ── D1/D2: what changed after the reader could see it ─────────────────
    for (const [key, label] of RESTYLE_KEYS) {
      let before = atPaint?.[key] ?? '';
      let after = settled?.[key] ?? '';
      if (key === 'cls') {
        // Compare the class SET, not the string. React's hydration can reorder
        // `class` without changing a single matched rule — `comfort:/altair/…`
        // reported `"style-graphite readable-font" → "readable-font
        // style-graphite"` — and a detector that calls that a flash is reporting
        // its own string comparison, not anything a reader saw.
        const set = (v) => v.trim().split(/\s+/).filter(Boolean).sort().join(' ');
        before = set(before);
        after = set(after);
      }
      if (before === after) continue;

      if (key === 'ground') {
        const delta = groundDelta(before, after);
        if (delta < GROUND_LUMA_DELTA) {
          notes.push(
            `ground settled from ${before} to ${after} (Δ${delta.toFixed(3)} — under the gate)`,
          );
          continue;
        }
        findings.push({
          kind: 'ground',
          detail: `${label} changed after first paint: ${before} → ${after} (Δluma ${delta.toFixed(3)})`,
          at: samples.find((s) => s.t > fcp && s.ground === after)?.t ?? null,
        });
        continue;
      }

      findings.push({
        kind: 'restyle',
        detail: `${label} changed after first paint: ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
        at: samples.find((s) => s.t > fcp && s[key] === after)?.t ?? null,
      });
    }

    // ── D3: stylesheets that restyled live content after first paint ───────
    //
    // Three things make this detector precise rather than noisy, and all three
    // were learned by watching it be noisy first:
    //
    // **Applied, not merely fetched.** Measured from `document.styleSheets`. The
    // router preloads route chunks on hover, the speculation rules prefetch whole
    // documents, and Vite's `__vitePreload` even inserts a `<link rel=stylesheet>`
    // for a dynamically-imported chunk — so a page fetches CSS for routes it is
    // not showing. Only a sheet in THIS document's cascade can restyle it.
    //
    // **Judged at the frame it arrives**, by the instrument, not here. See
    // `noteSheet` in fouc-instrument.mjs: `__vitePreload` awaits a chunk's CSS
    // before executing the chunk, so a game's stylesheet routinely lands hundreds
    // of milliseconds BEFORE the game's markup exists. Asked after the page
    // settles, every one of its selectors matches and the sheet looks like a
    // flash; asked when it arrived, none of them did and nothing ever painted
    // unstyled.
    //
    // **Universal selectors excluded.** `:root` matches by definition. What a late
    // `:root` block actually changes is caught by the root-restyle, layout-shift
    // and compositor-frame detectors, which measure the consequence.
    const appliedAtPaint = new Set(atPaint?.sheets ?? []);
    const appliedSettled = settled?.sheets ?? [];
    const impact = state.sheetImpact ?? {};

    for (const href of appliedSettled) {
      if (appliedAtPaint.has(href)) continue;
      const info = impact[href];
      const timing = state.sheets.find((s) => s.name === href);
      const appliedAt =
        info?.t ?? samples.find((s) => s.t > fcp && s.sheets.includes(href))?.t ?? null;
      const where = `${href.replace(ORIGIN, '')} entered the cascade ${
        appliedAt === null ? '?' : Math.round(appliedAt - fcp)
      }ms after first paint${timing ? ` (fetched +${Math.round(timing.end - fcp)}ms)` : ''}`;

      if (!info) {
        notes.push(
          `${where}; the instrument never saw it arrive (it was added between the last sample and settle).`,
        );
      } else if (!info.readable) {
        notes.push(`${where}; ${info.reason} — impact covered by the font detector.`);
      } else if (info.liveMatches.length) {
        findings.push({
          kind: 'late-css',
          detail: `${where} and restyled content that was ALREADY on the page — ${
            info.liveMatches.length >= 6 ? '6+' : info.liveMatches.length
          } of its ${info.selectorCount} selectors matched live elements at that moment, e.g. ${info.liveMatches
            .slice(0, 3)
            .join(', ')}`,
          at: appliedAt,
        });
      } else {
        notes.push(
          `${where}; none of its ${info.selectorCount} selectors matched anything in the document at that moment (${info.rootOnly} universal), so it styled content that had not rendered yet — the preload ordering worked.`,
        );
      }
    }

    // A sheet fetched late that never joined the cascade is a prefetch doing its
    // job; noted rather than dropped so the report shows the distinction.
    const fetchedLateUnapplied = state.sheets.filter(
      (s) => s.end > fcp + 1 && !appliedSettled.includes(s.name),
    );
    if (fetchedLateUnapplied.length) {
      notes.push(
        `${fetchedLateUnapplied.length} stylesheet(s) fetched after first paint without entering the cascade: ${fetchedLateUnapplied
          .map((s) => s.name.replace(ORIGIN, ''))
          .slice(0, 4)
          .join(', ')}`,
      );
    }

    // ── D3b: web fonts that swapped under visible text ─────────────────────
    //
    // `deferredFontsScript` loads the decorative families from Google Fonts after
    // the page is interactive — deliberately, to keep them off the critical path.
    // That is the right trade for a family nothing on the page uses, and a visible
    // reflow for one it does: `font-display: swap` paints the text in the fallback
    // face first and re-lays it out when the real face lands.
    //
    // So the detector asks the only question that separates the two, and asks it
    // with timing rather than by assumption: is any VISIBLE text on this page set
    // in a family whose font FILE finished downloading after first contentful
    // paint? Inter is self-hosted and preloaded in `__root.tsx`'s `head()`, so it
    // lands before paint and never trips this, even though `document.fonts`
    // reports it as loaded like any other.
    const lateFamilies = new Map();
    for (const [family, loadedAt] of Object.entries(state.fontLoadedAt ?? {})) {
      if (loadedAt <= fcp + 1) continue;
      // Every face of this family is `font-display: optional` — the self-hosted
      // display faces (app/fonts/) all are. Such a face never swaps under text
      // already on screen: past its ~100ms window it is simply not used for this
      // page view, so a late download is a cache warm-up, not a flash.
      if (!state.fontSwaps?.[family]) continue;
      lateFamilies.set(family, loadedAt);
    }

    if (lateFamilies.size) {
      const used = await page.evaluate(
        (families) => {
          // Both sides are real CSS family names now (the instrument reads them from
          // `document.fonts`), so the only normalisation needed is quotes and case.
          const key = (name) =>
            name
              .replace(/^['"]|['"]$/g, '')
              .trim()
              .toLowerCase();
          const wanted = new Set(families.map(key));
          const hits = new Map();
          let examined = 0;
          for (const el of document.querySelectorAll('body *')) {
            if (examined > 1500) break;
            if (!el.textContent || !el.textContent.trim()) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            if (rect.top > window.innerHeight || rect.bottom < 0) continue;
            examined++;
            // First choice only: a later entry in the stack is the fallback, not
            // what the reader ends up seeing.
            const first = key(getComputedStyle(el).fontFamily.split(',')[0]);
            if (wanted.has(first) && !hits.has(first)) {
              hits.set(
                first,
                el.tagName.toLowerCase() +
                  (el.className && typeof el.className === 'string'
                    ? '.' + el.className.trim().split(/\s+/)[0]
                    : ''),
              );
            }
          }
          return [...hits.entries()];
        },
        [...lateFamilies.keys()],
      );

      // `lateFamilies` is keyed by the family's own spelling; the page answered in
      // lower case, so look the timing back up the same way.
      const timingFor = (lowered) => {
        for (const [family, at] of lateFamilies) {
          if (family.trim().toLowerCase() === lowered) return at;
        }
        return null;
      };

      for (const [family, where] of used) {
        const at = timingFor(family);
        findings.push({
          kind: 'font-swap',
          detail: `visible text is set in "${family}", which only became available ${
            at === null ? '?' : Math.round(at - fcp)
          }ms after first paint — the text painted in the fallback face and reflowed (seen on ${where})`,
          at,
        });
      }
    }

    // ── D4: hydration ─────────────────────────────────────────────────────
    for (const h of state.hydrationErrors) {
      findings.push({ kind: 'hydration', detail: h.message, at: h.t });
    }

    // ── D5: layout shift after first paint ────────────────────────────────
    const postFcpShift = state.shifts
      .filter((s) => s.t > fcp)
      .reduce((total, s) => total + s.value, 0);
    if (postFcpShift > POST_FCP_CLS_LIMIT) {
      const worst = state.shifts.filter((s) => s.t > fcp).sort((a, b) => b.value - a.value)[0];
      const sources = worst?.sources ?? [];
      const detail = `${postFcpShift.toFixed(3)} of layout shift after first paint (limit ${POST_FCP_CLS_LIMIT}); largest from ${sources.join(', ') || 'unknown'}`;
      const known = KNOWN_SHIFTS.find(
        (k) => k.route === target.url && sources.includes(k.element) && postFcpShift <= k.max,
      );
      if (known) notes.push(`${detail} — known and allowed: ${known.why}`);
      else findings.push({ kind: 'shift', detail, at: worst?.t ?? null });
    }

    // ── D6: compositor frames ─────────────────────────────────────────────
    //
    // Two signals, because one is not enough — the self-test proved it. Divergence
    // alone misses a flash that never goes away (cover the viewport after first
    // paint and every later frame, the settled one included, shows the cover, so
    // the series converges); late-settle alone would flag a page that is merely
    // slow to finish loading an image. Together they bracket the question:
    // "did the picture change after the reader could see it, and had it stopped
    // changing by the time it should have?"
    let frameReport = null;
    if (captureFrames && frames.length >= 3) {
      // Decoding is the audit's dominant cost — a 4s capture is ~70 JPEGs, and
      // decoding every one of them on 4 concurrent workers saturates the box.
      // Evenly subsample to FRAME_ANALYSIS_BUDGET, always keeping the first and
      // last frame (the series' anchors): at ~55ms apart a flash is still sampled
      // a dozen times over, and a whole-site pass finishes.
      const sampled = subsampleFrames(frames, FRAME_ANALYSIS_BUDGET);
      const analyzer = await analyzerPage(context);
      try {
        const stats = await analyzer.evaluate(
          `(${FRAME_ANALYZER})(${JSON.stringify(sampled.map((f) => ({ data: f.data, t: f.t })))})`,
        );
        frameReport = analyseFrames(stats);
        // The filmstrip is the audit's evidence in a form a human can look at:
        // the real painted frames, in order, each labelled with how long after
        // first paint it was shown. Collected here rather than from a second load
        // so the pictures ARE the frames the detectors measured — a re-run can
        // race differently and then the picture and the verdict disagree.
        if (filmstrip) {
          const t0 = stats[0]?.t ?? 0;
          filmstrip.push({
            route: target.url,
            landedOn,
            profile: profileName,
            profileWhy: profile.why,
            fcp,
            frames: subsampleFrames(
              sampled.map((f, i) => ({
                data: f.data,
                dt: Math.round(((stats[i]?.t ?? t0) - t0) * 1000),
              })),
              FILMSTRIP_FRAME_BUDGET,
            ),
            report: frameReport,
            groundAtPaint: atPaint?.ground ?? null,
            groundSettled: settled?.ground ?? null,
            findings: findings.map((f) => ({ kind: f.kind, detail: f.detail })),
            notes: [...notes],
          });
        }
        if (process.env.FOUC_DEBUG) {
          console.log('[report]', target.url, profileName, JSON.stringify(frameReport));
        }
        const gate = profile.framesGate !== false;
        const raise = (entry) => {
          if (gate) findings.push(entry);
          else notes.push(`${entry.detail} (not gated under this profile)`);
        };

        const animating = Boolean(frameReport && frameReport.stillMoving > FRAME_ANIMATING_LIMIT);
        if (frameReport && frameReport.divergence > FRAME_DIVERGENCE_LIMIT) {
          const detail = `painted frames moved AWAY from the settled picture by ${(frameReport.divergence * 100).toFixed(1)}% (limit ${(FRAME_DIVERGENCE_LIMIT * 100).toFixed(0)}%)`;
          if (animating) {
            notes.push(
              `${detail}, but the page was still animating when the capture ended (${(frameReport.stillMoving * 100).toFixed(2)}% residual frame-to-frame change over the last quarter) — there is no settled picture to compare against, so this is not gated. The root-level detectors still are.`,
            );
          } else {
            raise({
              kind: 'frame',
              detail: `${detail} — something was shown and then changed`,
              at: frameReport.divergeAt,
            });
          }
        }
        // Late settle is REPORTED, not gated, and the reason is worth stating
        // because it is the one judgement call in the harness.
        //
        // A picture that is still moving a second after content appeared might be
        // a flash — or an image, a map tile or a chart finishing its arrival,
        // which is not a defect. The two are indistinguishable at 24x48. What IS
        // distinguishable is a flash's cause, and every cause has its own detector
        // above: a root token (D2), a stylesheet (D3), a font (D3b), a layout
        // shift (D5). So this signal's job is to point a human at a page, not to
        // fail the build on a guess.
        if (frameReport && !animating && frameReport.maxUnsettled > FRAME_LATE_SETTLE_LIMIT) {
          notes.push(
            `the painted picture was still ${(frameReport.maxUnsettled * 100).toFixed(1)}% different from its settled state ${Math.round(frameReport.maxUnsettledAtMs)}ms after content first appeared; it stopped moving at +${frameReport.settledFromMs ?? '?'}ms`,
          );
        }
      } finally {
        // The analyzer page lives for the context's lifetime, not the run's; the
        // context is closed in this function's own `finally`.
      }
    }

    return {
      findings,
      notes,
      status,
      landedOn,
      timings: { fcp, lcp: state.lcp, loadEnd: state.loadEnd },
      cls: state.cls,
      postFcpShift,
      frames: frameReport,
      consoleErrors: consoleErrors.slice(0, 5),
      pageErrors: pageErrors.slice(0, 5),
      groundAtPaint: atPaint?.ground ?? null,
      groundSettled: settled?.ground ?? null,
      rootMutations: state.rootMutations.filter((m) => m.t > fcp).slice(0, 10),
    };
  } finally {
    frames = [];
    await context.close().catch(() => {});
  }
}

// ── Self-test ────────────────────────────────────────────────────────────────

/**
 * Prove the detectors still fire.
 *
 * An audit that passes because its instrument broke is worse than no audit: it
 * is a claim of coverage with nothing behind it, and this harness has already
 * failed that way once (a regex escape eaten by the template literal killed
 * `INSTRUMENT_SOURCE`, and every page came back "clean" until the missing
 * `window.__fouc` was itself made a finding). So `--self-test` sabotages a real
 * page in one specific way per detector and asserts that the matching detector catches each
 * one. It is cheap, it runs against the same server as the audit, and a green
 * audit is only meaningful after it.
 */
const SABOTAGES = [
  {
    name: 'ground',
    expect: 'ground',
    why: 'Repaint the document ground half a second after first paint — the white-then-black flash themeScript exists to prevent.',
    script: `requestAnimationFrame(() => setTimeout(() => {
      document.documentElement.style.backgroundColor = 'rgb(0, 128, 0)';
      if (document.body) document.body.style.backgroundColor = 'rgb(0, 128, 0)';
    }, 600))`,
  },
  {
    name: 'restyle',
    expect: 'restyle',
    why: 'Add a theme class to <html> after first paint — the shape of the app-route bug.',
    script: `requestAnimationFrame(() => setTimeout(() => {
      document.documentElement.classList.add('fouc-self-test-late-class');
    }, 600))`,
  },
  {
    name: 'late-css',
    expect: 'late-css',
    why: 'Link a stylesheet after first paint whose selectors match elements already on screen (not `body` — universal selectors are excluded by design).',
    script: `requestAnimationFrame(() => setTimeout(() => {
      const style = document.createElement('style');
      style.textContent = 'body { outline: 0 solid transparent }';
      // A <style> has no href, so it cannot be mistaken for a linked sheet; use a
      // blob URL to make it a real linked stylesheet arriving late.
      const blob = new Blob(['main,a[href]{letter-spacing:0.01px}'], { type: 'text/css' });
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = URL.createObjectURL(blob);
      document.head.appendChild(link);
      void style;
    }, 600))`,
  },
  {
    name: 'font-swap',
    expect: 'font-swap',
    why: 'Load a web font after first paint and set visible text in it — the FOUT that `font-display: swap` buys in exchange for a faster first paint.',
    // Reuses the site's own self-hosted Inter file under a new family name and a
    // cache-busting query, so the fetch is real and happens after paint without
    // the audit needing a font asset of its own or any outbound network.
    script: `requestAnimationFrame(() => setTimeout(async () => {
      try {
        const href = [...document.querySelectorAll('link[rel="preload"][as="font"]')]
          .map((l) => l.href)
          .find(Boolean);
        if (!href) return;
        const face = new FontFace('FoucAuditFace', 'url(' + href + '?fouc-audit=1)');
        await face.load();
        document.fonts.add(face);
        const style = document.createElement('style');
        style.textContent = 'body, body h1, body h2, body p, body a, body span, body div { font-family: FoucAuditFace, serif !important }';
        document.head.appendChild(style);
      } catch (e) { /* the sabotage failing is itself a self-test failure */ }
    }, 700))`,
  },
  {
    name: 'hydration',
    expect: 'hydration',
    why: 'Report a hydration mismatch the way a PRODUCTION React build does — through `reportError`, never the console. The detector listened only to console.error until a production #418 went unseen on every load of a page whose whole <html> it wiped.',
    script: `requestAnimationFrame(() => setTimeout(() => {
      const err = new Error('Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= (fouc self-test)');
      if (typeof reportError === 'function') reportError(err);
      else setTimeout(() => { throw err; });
    }, 600))`,
  },
  {
    name: 'frame',
    expect: 'frame',
    why: 'Cover the viewport with an opaque panel after first paint and then take it away — a transient flash that moves no root token, changes no stylesheet and leaves nothing behind for the DOM detectors to find.',
    script: `requestAnimationFrame(() => setTimeout(() => {
      const panel = document.createElement('div');
      panel.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#7f00ff');
      document.documentElement.appendChild(panel);
      setTimeout(() => panel.remove(), 500);
    }, 900))`,
  },
];

async function selfTest(browser, target, throttle) {
  console.log(`Self-test — proving each detector fires, on ${target.url}\n`);
  const failures = [];
  for (const sabotage of SABOTAGES) {
    const outcome = await auditPage({
      browser,
      target,
      profileName: 'fresh',
      profile: PROFILES.fresh,
      captureFrames: true,
      sabotage: sabotage.script,
      throttle,
    });
    const kinds = new Set(outcome.findings.map((f) => f.kind));
    const caught = kinds.has(sabotage.expect);
    console.log(`  ${caught ? '✓' : '✗'} ${sabotage.expect.padEnd(9)} ${sabotage.why}`);
    if (!caught) {
      failures.push(
        `${sabotage.name}: expected a "${sabotage.expect}" finding, got ${
          kinds.size ? [...kinds].join(', ') : 'nothing'
        }`,
      );
    }
  }
  if (failures.length) {
    console.error(`\n❌ Self-test failed — the audit cannot be trusted until these pass:`);
    for (const f of failures) console.error(`  - ${f}`);
    return false;
  }
  console.log(`\n✅ All ${SABOTAGES.length} detectors fire on a deliberate flash.`);
  return true;
}

// ── Filmstrip ────────────────────────────────────────────────────────────────

/**
 * Render the captured frames as a page a human can look at.
 *
 * A FOUC verdict is a number, and a number is exactly the wrong format for "does
 * this look right". The filmstrip puts the audit's own evidence — the real
 * compositor frames it measured, in order, each labelled with how long after first
 * paint it was on screen — next to the verdict it drew from them, so the two can
 * be checked against each other by eye.
 *
 * Signed-out and signed-in runs of the same route are laid out as adjacent rows,
 * because that pair is the comparison that matters most on a social site: the
 * shell a visitor gets versus the one an account gets, and whether either of them
 * changes after the reader can see it.
 */
function renderFilmstrip(strips) {
  const byRoute = new Map();
  for (const strip of strips) {
    if (!byRoute.has(strip.route)) byRoute.set(strip.route, []);
    byRoute.get(strip.route).push(strip);
  }

  const esc = (v) =>
    String(v).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );

  const row = (strip) => {
    const verdict = strip.findings.length
      ? `<span class="bad">${strip.findings.length} finding(s)</span>`
      : '<span class="ok">clean</span>';
    const cells = strip.frames
      .map(
        (f) => `<figure><img src="data:image/jpeg;base64,${f.data}" alt="" loading="lazy" />
          <figcaption>+${f.dt}ms</figcaption></figure>`,
      )
      .join('');
    const grounds =
      strip.groundAtPaint === strip.groundSettled
        ? `<span class="sw" style="background:${esc(strip.groundAtPaint)}"></span> held ${esc(strip.groundAtPaint)} throughout`
        : `<span class="sw" style="background:${esc(strip.groundAtPaint)}"></span> ${esc(strip.groundAtPaint)}
           → <span class="sw" style="background:${esc(strip.groundSettled)}"></span> ${esc(strip.groundSettled)}`;
    const detail = [
      ...strip.findings.map((f) => `<li class="bad"><b>${esc(f.kind)}</b> ${esc(f.detail)}</li>`),
      ...strip.notes.map((n) => `<li class="note">${esc(n)}</li>`),
    ].join('');
    return `<section class="run">
      <h3>${esc(strip.profile)} ${verdict}</h3>
      <p class="meta">${esc(strip.profileWhy)}</p>
      <p class="meta">first contentful paint ${strip.fcp === null ? '—' : Math.round(strip.fcp) + 'ms'}
        · settled ${strip.report?.settledFromMs ?? '—'}ms after content appeared
        · ground: ${grounds}${
          strip.landedOn && strip.landedOn.replace(/\/+$/, '') !== strip.route.replace(/\/+$/, '')
            ? ` · <b>redirected to ${esc(strip.landedOn)}</b>`
            : ''
        }</p>
      <div class="strip">${cells}</div>
      ${detail ? `<ul class="detail">${detail}</ul>` : ''}
    </section>`;
  };

  const sections = [...byRoute.entries()]
    .map(
      ([route, runs]) => `<article>
        <h2><code>${esc(route)}</code></h2>
        ${runs.map(row).join('')}
      </article>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FOUC filmstrips</title>
<style>
  :root { color-scheme: dark light; --ink: #e8e8ea; --dim: #9a9aa2; --bg: #141416; --card: #1c1c20; --line: #2c2c32; }
  @media (prefers-color-scheme: light) {
    :root { --ink: #1a1a1c; --dim: #5a5a62; --bg: #f6f6f8; --card: #fff; --line: #e2e2e8; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--ink);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .lede { color: var(--dim); margin: 0 0 28px; max-width: 70ch; }
  article { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    padding: 16px; margin: 0 0 20px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  h2 code { background: color-mix(in srgb, var(--ink) 10%, transparent); padding: 2px 6px; border-radius: 5px; }
  .run { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
  .run:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
  h3 { font-size: 14px; margin: 0 0 4px; font-weight: 600; }
  .meta { color: var(--dim); font-size: 12.5px; margin: 0 0 8px; }
  .ok { color: #4ea96b; font-weight: 600; }
  .bad { color: #e0604f; font-weight: 600; }
  .sw { display: inline-block; width: 11px; height: 11px; border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--ink) 35%, transparent); vertical-align: -1px; }
  .strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; }
  figure { margin: 0; flex: 0 0 auto; text-align: center; }
  img { display: block; width: 104px; height: auto; border-radius: 4px;
    border: 1px solid var(--line); background: #000; }
  figcaption { font-size: 10.5px; color: var(--dim); margin-top: 3px; font-variant-numeric: tabular-nums; }
  .detail { margin: 10px 0 0; padding-left: 18px; font-size: 12.5px; }
  .detail li { margin: 3px 0; }
  .detail .note { color: var(--dim); }
</style>
</head>
<body><div class="wrap">
<h1>FOUC filmstrips</h1>
<p class="lede">Real compositor frames from <code>testing/e2e/fouc.mjs</code>, in the
order they were painted, each labelled with how long after the first captured frame
it was on screen. These are the exact frames the detectors measured. A clean load
looks the same from its first content-bearing frame to its last.</p>
${sections}
</div></body>
</html>`;
}

// ── Runner ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    profiles: null,
    routes: null,
    json: null,
    frames: true,
    concurrency: 4,
    quick: false,
    limit: null,
    selfTest: false,
    auth: true,
    throttle: DEFAULT_CPU_THROTTLE,
    filmstrip: null,
    windowMs: SAMPLE_WINDOW_MS,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quick') args.quick = true;
    else if (a === '--no-frames') args.frames = false;
    else if (a === '--profiles')
      args.profiles = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '--route') (args.routes ??= []).push(argv[++i]);
    else if (a === '--routes-matching') args.routePattern = new RegExp(argv[++i]);
    else if (a === '--json') args.json = argv[++i];
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--limit') args.limit = Number(argv[++i]) || null;
    else if (a === '--self-test') args.selfTest = true;
    else if (a === '--no-auth') args.auth = false;
    else if (a === '--throttle') args.throttle = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--filmstrip') args.filmstrip = argv[++i];
    else if (a === '--window')
      args.windowMs = Math.max(1000, Number(argv[++i]) || SAMPLE_WINDOW_MS);
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`unknown flag: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      `FOUC audit\n\n  node testing/e2e/fouc.mjs [--quick] [--route <path>]… [--profiles a,b]\n                            [--json <file>] [--no-frames] [--concurrency N] [--limit N]\n  node testing/e2e/fouc.mjs --self-test     # prove the detectors fire, first\n  node testing/e2e/fouc.mjs --route / --profiles fresh,signed-in --filmstrip out.html\n\nCPU is throttled ${DEFAULT_CPU_THROTTLE}x by default; --throttle 1 turns that off.\nBASE_URL defaults to http://localhost:3000 and must point at a BUILT server.`,
    );
    return;
  }

  const { audited, skipped, unaccounted } = collectRoutes();
  if (unaccounted.length) {
    console.error(
      `\n❌ ${unaccounted.length} route(s) in app/routeTree.gen.ts are neither audited nor excluded:`,
    );
    for (const r of unaccounted) console.error(`  - ${r}`);
    console.error(
      `\nAdd each to DYNAMIC_ROUTE_FIXTURES or EXCLUDED_STATIC_PATHS in testing/e2e/fouc-routes.mjs.`,
    );
    process.exit(1);
  }

  let targets = audited;
  if (args.routes) {
    const wanted = new Set(args.routes);
    targets = audited.filter((t) => wanted.has(t.route) || wanted.has(t.url));
    if (!targets.length) {
      console.error(`no audited route matched ${args.routes.join(', ')}`);
      process.exit(1);
    }
  }
  if (args.routePattern) {
    targets = targets.filter((t) => args.routePattern.test(t.url));
    if (!targets.length) {
      console.error(`no audited route matched /${args.routePattern.source}/`);
      process.exit(1);
    }
  }
  if (args.limit) targets = targets.slice(0, args.limit);

  let profileNames = args.profiles ?? (args.quick ? QUICK_PROFILES : Object.keys(PROFILES));
  for (const name of profileNames) {
    if (!PROFILES[name]) {
      console.error(`unknown profile: ${name} (have: ${Object.keys(PROFILES).join(', ')})`);
      process.exit(1);
    }
  }
  if (!args.auth) {
    const dropped = profileNames.filter((n) => PROFILES[n].auth);
    profileNames = profileNames.filter((n) => !PROFILES[n].auth);
    if (dropped.length) {
      console.log(
        `  (--no-auth: skipping ${dropped.join(', ')}; signed-in pages will be audited as their redirect target)\n`,
      );
    }
  }

  console.log(`FOUC audit → ${BASE_URL}`);
  console.log(`  pages      ${targets.length} audited, ${skipped.length} excluded by reason`);
  console.log(`  profiles   ${profileNames.join(', ')}`);
  console.log(`  frames     ${args.frames ? 'on (compositor screencast)' : 'off'}`);
  console.log(
    `  window     ${args.windowMs}ms${
      args.windowMs < SAMPLE_WINDOW_MS
        ? ' — SHORTER than the default, so idle-gated flashes after this point are invisible'
        : ''
    }`,
  );
  console.log(
    `  cpu        ${args.throttle > 1 ? `${args.throttle}x throttled` : 'unthrottled (results are not reproducible — see --throttle)'}`,
  );
  console.log(`  runs       ${targets.length * profileNames.length}\n`);

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
    ],
  });

  if (args.selfTest) {
    try {
      const ok = await selfTest(browser, targets[0], args.throttle);
      process.exitCode = ok ? 0 : 1;
    } finally {
      await browser.close();
    }
    return;
  }

  const jobs = [];
  for (const profileName of profileNames) {
    for (const target of targets) jobs.push({ target, profileName });
  }

  const results = [];
  const filmstrips = args.filmstrip ? [] : null;
  let done = 0;
  let nextJob = 0;

  const worker = async () => {
    for (;;) {
      const index = nextJob++;
      if (index >= jobs.length) return;
      const { target, profileName } = jobs[index];
      let outcome;
      try {
        outcome = await auditPage({
          browser,
          target,
          profileName,
          profile: PROFILES[profileName],
          captureFrames: args.frames,
          throttle: args.throttle,
          filmstrip: filmstrips,
          windowMs: args.windowMs,
        });
      } catch (error) {
        outcome = {
          findings: [{ kind: 'crashed', detail: String(error.message).slice(0, 400) }],
          notes: [],
        };
      }
      results.push({
        route: target.route,
        url: target.url,
        fidelity: target.fidelity,
        profile: profileName,
        ...outcome,
      });
      done++;
      const bad = outcome.findings.length;
      const mark = bad ? '✗' : '·';
      process.stdout.write(
        `${mark} [${String(done).padStart(String(jobs.length).length)}/${jobs.length}] ${profileName} ${target.url}${bad ? ` — ${bad} finding(s)` : ''}\n`,
      );
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(args.concurrency, jobs.length) }, worker));
  } finally {
    await browser.close();
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const withFindings = results.filter((r) => r.findings.length);
  const byKind = new Map();
  for (const r of withFindings) {
    for (const f of r.findings) {
      if (!byKind.has(f.kind)) byKind.set(f.kind, []);
      byKind.get(f.kind).push({ ...f, route: r.url, profile: r.profile });
    }
  }

  // Which pages the audit actually looked at, as opposed to asked for. A page
  // that redirects was audited as its destination, and saying so is the
  // difference between "287 pages are clean" and a number that means nothing.
  // A trailing slash is route normalisation, not a redirect away from the page —
  // `/admin/` and `/admin` are the same document, and counting them as a miss
  // would understate coverage as badly as ignoring real redirects overstates it.
  const samePage = (a, b) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
  const redirected = results.filter((r) => r.landedOn && !samePage(r.landedOn, r.url));
  const redirectedPages = new Map();
  for (const r of redirected) {
    if (!redirectedPages.has(r.url)) redirectedPages.set(r.url, r.landedOn);
  }
  const directPages = new Set(results.filter((r) => !redirectedPages.has(r.url)).map((r) => r.url));

  console.log(`\n${'─'.repeat(78)}\nFOUC audit results`);
  console.log(`  runs            ${results.length}`);
  console.log(`  clean           ${results.length - withFindings.length}`);
  console.log(`  with findings   ${withFindings.length}`);
  console.log(`\nCoverage`);
  console.log(`  visited as themselves   ${directPages.size} page(s)`);
  console.log(
    `  redirected away         ${redirectedPages.size} page(s) — audited as their destination, not as themselves`,
  );
  if (redirectedPages.size) {
    const sample = [...redirectedPages.entries()].slice(0, 8);
    for (const [from, to] of sample) console.log(`    ${from} → ${to}`);
    if (redirectedPages.size > 8)
      console.log(`    …and ${redirectedPages.size - 8} more (see --json)`);
    console.log(`  These need an authenticated profile to audit directly; see docs/fouc.md.`);
  }

  if (byKind.size) {
    console.log(`\nFindings by kind:`);
    for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const routes = new Set(list.map((f) => f.route));
      console.log(
        `  ${kind.padEnd(12)} ${String(list.length).padStart(5)} across ${routes.size} page(s)`,
      );
    }

    for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n── ${kind} ${'─'.repeat(70 - kind.length)}`);
      const seen = new Map();
      for (const f of list) {
        const key = `${f.detail}`;
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push(`${f.profile}:${f.route}`);
      }
      for (const [detail, where] of [...seen.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 40)) {
        console.log(`  ${detail}`);
        console.log(
          `    ${where.length} run(s): ${where.slice(0, 6).join(', ')}${where.length > 6 ? `, …+${where.length - 6}` : ''}`,
        );
      }
      if (seen.size > 40)
        console.log(`  …and ${seen.size - 40} more distinct ${kind} finding(s) (see --json)`);
    }
  }

  if (filmstrips) {
    if (!args.frames) {
      console.error('\n--filmstrip needs frames; drop --no-frames.');
    } else {
      // Signed-out before signed-in for each route, so the pair reads in the order
      // a reviewer thinks about it.
      const order = profileNames.indexOf.bind(profileNames);
      filmstrips.sort(
        (a, b) => a.route.localeCompare(b.route) || order(a.profile) - order(b.profile),
      );
      mkdirSync(join(args.filmstrip, '..'), { recursive: true });
      writeFileSync(args.filmstrip, renderFilmstrip(filmstrips));
      const bytes = (existsSync(args.filmstrip) && statSync(args.filmstrip).size) || 0;
      console.log(
        `\nFilmstrip → ${args.filmstrip} (${filmstrips.length} run(s), ${(bytes / 1024 / 1024).toFixed(1)} MB)`,
      );
    }
  }

  if (args.json) {
    const out = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      profiles: profileNames,
      thresholds: {
        GROUND_LUMA_DELTA,
        POST_FCP_CLS_LIMIT,
        FRAME_DIVERGENCE_LIMIT,
        FRAME_LATE_SETTLE_LIMIT,
        FRAME_ANIMATING_LIMIT,
      },
      coverage: {
        audited: targets.length,
        excluded: skipped,
        visitedDirectly: [...directPages].sort(),
        redirected: [...redirectedPages.entries()].map(([from, to]) => ({ from, to })),
      },
      results,
    };
    mkdirSync(join(REPO_ROOT, args.json, '..'), { recursive: true });
    writeFileSync(args.json, JSON.stringify(out, null, 2));
    console.log(`\nJSON report → ${args.json}`);
  }

  if (withFindings.length) {
    console.error(
      `\n❌ FOUC audit failed: ${withFindings.length} of ${results.length} run(s) carry findings.`,
    );
    process.exit(1);
  }
  console.log(
    `\n✅ No FOUC on ${directPages.size} page(s) visited directly × ${profileNames.length} profile(s)` +
      `${redirectedPages.size ? `, plus ${redirectedPages.size} that redirect away` : ''}.`,
  );
}

main().catch((error) => {
  console.error('fouc audit crashed:', error);
  process.exit(1);
});
