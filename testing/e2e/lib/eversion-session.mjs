// ─────────────────────────────────────────────────────────────────────────────
// The eversion e2e session (T14; spec §11.2 preamble).
//
// Every eversion suite (T27 parity, T34 behaviour, T35 smoothness, T36 perf)
// needs the same rig: Chromium at one of two device profiles, in one of three
// themes, with the effect forced on, a way to read the controller's
// `performance.mark`s, and a recording of the frames the compositor actually
// presented. This is that rig, so the suites contain assertions and not setup,
// and "desktop dark" means the same thing in all of them.
//
//   import { openSession, PROFILES, THEMES } from './lib/eversion-session.mjs';
//   const s = await openSession({ profile: 'mobile', theme: 'light' });
//   await s.goto('/');                       // appends ?eversion=1 (and -debug=1)
//   await s.startRecording();
//   … drive the page …
//   const frames = await s.stopRecording();  // [{ tMs, buffer }] on the page clock
//   const marks  = await s.marks();          // [{ name, startTime, detail }]
//   await s.close();
//
// ## Why the marks are the clock
//
// The suites do not infer what the effect is doing from the picture; they read
// the marks (`lib/eversion/marks.ts`, imported below so a typo cannot make an
// assertion pass vacuously). Screencast frames are therefore stamped on the
// PAGE's `performance.now()` timeline — the same one the marks use — so "was
// there a hard cut between :evert and :unwrap" is a plain interval query.
//
// ## Environment
//
//   BASE_URL           default http://localhost:7005 (the built server)
//   EVERSION_CHROMIUM  Chromium binary; falls back to /opt/pw-browsers/chromium,
//                      then Playwright's own (same resolution as fouc.mjs: images
//                      pin one build and forbid `playwright install`).
//
// `marks.ts` is loaded straight from the repo by Node's type stripping; it holds
// only `import type`s, which is what keeps that possible (do not add a runtime
// import to it).
// ─────────────────────────────────────────────────────────────────────────────

/* global performance, localStorage -- referenced only inside page.evaluate() callbacks, which
   Playwright serialises and runs in the page. */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { EVERSION_MARKS } from '../../../lib/eversion/marks.ts';

export { EVERSION_MARKS };

/** Device profiles (spec §11.2: desktop 1440 × 900 @1; mobile 390 × 844 @3 touch). */
export const PROFILES = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

/**
 * Themes, expressed as the stored preference + OS scheme the pre-paint script
 * reads (same shapes as the `fouc.mjs` profiles, so the theme is in place before
 * first paint rather than flipped after hydration).
 */
export const THEMES = {
  dark: { localStorage: { 'rmh-style': 'graphite' }, colorScheme: 'dark' },
  light: { localStorage: {}, colorScheme: 'light' },
  'high-contrast': { localStorage: { 'rmh-style': 'high-contrast' }, colorScheme: 'dark' },
};

export const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:7005').replace(/\/$/, '');

/**
 * Where failure evidence goes (screencast frames, diff images, JSON). CI sets
 * `EVERSION_ARTIFACT_DIR` and uploads the folder when the job fails (T16).
 */
export const ARTIFACT_DIR =
  process.env.EVERSION_ARTIFACT_DIR ?? join(tmpdir(), 'eversion-artifacts');

/** Write `data` to `ARTIFACT_DIR/name` (creating folders) and return the path. */
export function writeArtifact(name, data) {
  const file = join(ARTIFACT_DIR, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  return file;
}

/** Which Chromium to drive — see the header. */
export function resolveChromiumPath() {
  return (
    process.env.EVERSION_CHROMIUM ??
    (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
  );
}

/**
 * Launch Chromium. GPU flags make WebGL2 available under SwiftShader in a
 * container with no GPU; `--use-angle=swiftshader` is the same path CI takes.
 */
export function launchBrowser(opts = {}) {
  return chromium.launch({
    executablePath: resolveChromiumPath(),
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    ...opts,
  });
}

/**
 * Open a page in a fresh context with the given profile and theme.
 *
 * @param {{
 *   browser?: import('playwright').Browser,  // reuse one; otherwise launched (and closed by close())
 *   profile?: keyof typeof PROFILES,
 *   theme?: keyof typeof THEMES,
 *   baseUrl?: string,
 *   eversion?: boolean,   // append ?eversion=1 (default true)
 *   debug?: boolean,      // append ?eversion-debug=1 (default false)
 *   reducedMotion?: 'reduce' | 'no-preference',
 * }} [options]
 */
export async function openSession(options = {}) {
  const profile = options.profile ?? 'desktop';
  const theme = options.theme ?? 'dark';
  if (!PROFILES[profile]) throw new Error(`eversion-session: unknown profile "${profile}"`);
  if (!THEMES[theme]) throw new Error(`eversion-session: unknown theme "${theme}"`);
  const baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/$/, '');
  const ownsBrowser = !options.browser;
  const browser = options.browser ?? (await launchBrowser());

  const context = await browser.newContext({
    ...PROFILES[profile],
    colorScheme: THEMES[theme].colorScheme,
    reducedMotion: options.reducedMotion ?? 'no-preference',
  });
  const stored = THEMES[theme].localStorage;
  await context.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch {
      /* storage blocked: the theme falls back to the OS scheme, which is set too */
    }
  }, stored);
  const page = await context.newPage();

  /** Add the eversion query flags to a path or URL. */
  function withFlags(pathOrUrl) {
    const url = new URL(pathOrUrl, `${baseUrl}/`);
    if (options.eversion !== false) url.searchParams.set('eversion', '1');
    if (options.debug) url.searchParams.set('eversion-debug', '1');
    return url.toString();
  }

  /** Every `eversion:*` mark so far, on the page clock. Empty before the first run. */
  async function marks() {
    return page.evaluate(() =>
      performance
        .getEntriesByType('mark')
        .filter((m) => m.name.startsWith('eversion:'))
        .map((m) => ({ name: m.name, startTime: m.startTime, detail: m.detail ?? null })),
    );
  }

  /** Name → startTime of the LAST mark of each name (what interval queries want). */
  async function markTimes() {
    const out = {};
    for (const m of await marks()) out[m.name] = m.startTime;
    return out;
  }

  async function clearMarks() {
    await page.evaluate(() => {
      for (const m of performance.getEntriesByType('mark')) performance.clearMarks(m.name);
    });
  }

  /** Resolve with the first mark `name` (e.g. `EVERSION_MARKS.done`) at or after `since` ms. */
  async function waitForMark(name, { timeout = 15_000, since = 0 } = {}) {
    const handle = await page.waitForFunction(
      ([n, s]) => {
        const hit = performance.getEntriesByName(n, 'mark').find((m) => m.startTime >= s);
        return hit
          ? { name: hit.name, startTime: hit.startTime, detail: hit.detail ?? null }
          : null;
      },
      [name, since],
      { timeout, polling: 'raf' },
    );
    return handle.jsonValue();
  }

  // ── Screencast recorder ────────────────────────────────────────────────────
  let cdp = null;
  let recorded = null;
  let originOffsetMs = 0;
  let onFrame = null;

  /**
   * Begin recording compositor frames. Each frame is stamped on the page's
   * `performance.now()` clock (`tMs`) so it lines up with the marks.
   * Screencast frames are only produced when the compositor draws, so a static
   * page yields few — that is the signal, not a bug.
   */
  async function startRecording({ format = 'png', quality = 80, maxWidth, maxHeight } = {}) {
    if (cdp) throw new Error('eversion-session: already recording');
    cdp = await context.newCDPSession(page);
    recorded = [];
    // CDP frame timestamps are epoch seconds; the page clock is relative to
    // `timeOrigin`. Offset between them, read once.
    originOffsetMs = await page.evaluate(() => performance.timeOrigin);
    onFrame = (ev) => {
      recorded.push({
        tMs: ev.metadata.timestamp * 1000 - originOffsetMs,
        buffer: Buffer.from(ev.data, 'base64'),
      });
      // Unacknowledged frames stop the stream.
      cdp?.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    };
    cdp.on('Page.screencastFrame', onFrame);
    await cdp.send('Page.startScreencast', {
      format,
      quality,
      everyNthFrame: 1,
      // Optional downscale: the smoothness suite compares frames to frames, not to a
      // screenshot, so a few hundred pixels across is enough and decodes ~10x faster.
      ...(maxWidth ? { maxWidth } : {}),
      ...(maxHeight ? { maxHeight } : {}),
    });
  }

  /** Stop and return the frames: `[{ tMs, buffer }]`, ascending. */
  async function stopRecording() {
    if (!cdp) return [];
    const c = cdp;
    cdp = null;
    try {
      await c.send('Page.stopScreencast');
    } finally {
      c.off('Page.screencastFrame', onFrame);
      await c.detach().catch(() => {});
    }
    const frames = recorded ?? [];
    recorded = null;
    return frames.sort((a, b) => a.tMs - b.tMs);
  }

  return {
    page,
    context,
    browser,
    profile,
    theme,
    baseUrl,
    /** Navigate (a full load) with the eversion flags added. */
    goto: (pathOrUrl = '/', opts = {}) =>
      page.goto(withFlags(pathOrUrl), { waitUntil: 'load', ...opts }),
    withFlags,
    marks,
    markTimes,
    clearMarks,
    waitForMark,
    startRecording,
    stopRecording,
    /** A PNG screenshot of the viewport (not full page) — what S#29 compares the cover frame to. */
    screenshot: () => page.screenshot({ type: 'png', fullPage: false }),
    async close() {
      if (cdp) await stopRecording().catch(() => {});
      await context.close().catch(() => {});
      if (ownsBrowser) await browser.close().catch(() => {});
    },
  };
}
