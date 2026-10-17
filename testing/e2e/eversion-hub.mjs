// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion hub integration (T32; spec §9.2, §10.4; S#25 smoke) — Playwright
// against a RUNNING server.
//
//   # terminal 1 — web tier only (the realtime hubs and workers are not needed).
//   # A worktree needs a real `pnpm install` (a symlinked node_modules cannot run
//   # the dev server) and, if no XAI_API_KEY is in .env, a dummy one: the homes
//   # image module constructs an OpenAI client at import time.
//   XAI_API_KEY=dummy pnpm exec vite dev --port 7206 --strictPort --host 127.0.0.1
//   #   …or the built app: `pnpm build` then the Nitro server on 7005.
//
//   # terminal 2
//   BASE_URL=http://127.0.0.1:7206 node testing/e2e/eversion-hub.mjs
//
//   Optional: PROFILE=desktop|mobile (default desktop), THEME=dark|light|high-contrast,
//   SCREENSHOT_DIR=<dir> (mid-WRAP / mid-EVERSION / mid-UNWRAP PNGs),
//   ONLY=<scenario-name-substring>.
//
// ## What it checks (each failure names its scenario)
//
//  entry-release / entry-click / entry-enter   the three ways to confirm a pin run
//      the FULL effect (start … done in order, the entry recorded on `start`),
//      the URL lands on the destination, `navigate` happened at `start` and not
//      at the end, the hub returns to `closed`, the overlay is gone, `eversion-
//      cover` is gone, and the orb is visible and focusable afterwards.
//  dismiss-*   Escape, the X and an outside tap close the hub exactly as before
//      (focus returns to the orb) and never start a run.
//  preview   Settings → Appearance → Preview runs the effect in place.
//  reduced-motion   with the effect on for everyone (`EVERSION_ENABLED`), the
//      remaining way to get today's hub is `prefers-reduced-motion: reduce`: no
//      eversion marks, no overlay, and a pin confirmation navigates straight away.
//
// Faking nothing: real router, real capture, real worker host (SwiftShader).
// ─────────────────────────────────────────────────────────────────────────────

/* global MouseEvent, performance -- used only inside page.evaluate() callbacks. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVERSION_MARKS, openSession, BASE_URL } from './lib/eversion-session.mjs';

const PROFILE = process.env.PROFILE ?? 'desktop';
const THEME = process.env.THEME ?? 'dark';
const SHOT_DIR = process.env.SCREENSHOT_DIR;
const ONLY = process.env.ONLY ?? '';
/** Dev servers compile on first touch; give every wait room. */
const SLOW = 90_000;
const HOST_WARM_MS = Number(process.env.HOST_WARM_MS ?? 9000);
/** The whole effect, on a software GL and a loaded box, is slow; this is a ceiling, not a target. */
const RUN_MS = 150_000;

const results = [];

function check(scenario, cond, message) {
  if (!cond) throw new Error(`[${scenario}] ${message}`);
}

async function shot(page, name) {
  if (!SHOT_DIR) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  writeFileSync(join(SHOT_DIR, `${name}.png`), await page.screenshot({ type: 'png' }));
}

/** A fresh session on `/`, errors collected, the warm-up given time to land. */
async function fresh(opts = {}) {
  const s = await openSession({ profile: PROFILE, theme: THEME, ...opts });
  const errors = [];
  s.page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  s.page.on('console', (m) => {
    // The dev server 404s one asset on every page; that is not this feature's.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
      errors.push(`console.error: ${m.text().slice(0, 300)}`);
  });
  const requests = [];
  s.page.on('request', (r) => requests.push(r.url()));
  await s.goto(opts.path ?? '/', { timeout: SLOW });
  await s.page.waitForSelector('.radial-hub__orb', { timeout: SLOW });
  return { s, errors, requests };
}

/** Wait until the eversion is eligible (chunks prefetched, bridge mounted, controller handed up). */
async function untilReady(s) {
  // The warm-up runs ~0.8 s after mount and then fetches + compiles; the BEFORE
  // capture only starts once the hub is open. Poll the real signal: a run's
  // eligibility is what `prefetch` publishes as the `prefetch-done` style marks;
  // lacking an accessor, just give the idle work a generous, bounded window.
  await s.page.waitForTimeout(PROFILE === 'mobile' ? 9000 : 7000);
}

async function openHub(s) {
  await s.page.click('.radial-hub__orb');
  await s.page.waitForFunction(
    () => document.querySelector('.radial-hub')?.getAttribute('data-phase') === 'open',
  );
  // Past the open morph (500 ms), the BEFORE scheduler's hold-off, and the
  // controller's idle host init (`onHubOpened` +700 ms, then the programs
  // compile). The runner only waits HOST_READY_TIMEOUT_MS (600 ms) for the host
  // at release, so a release before this settles correctly FALLS BACK — which is
  // not what these scenarios are about. SwiftShader and a dev server make the
  // first init slow; a generous fixed wait is the only signal there is.
  await s.page.waitForTimeout(HOST_WARM_MS);
}

const phase = (s) =>
  s.page.evaluate(() => document.querySelector('.radial-hub')?.getAttribute('data-phase'));

/** Confirm `/games` by the given entry point. */
async function confirm(s, entry) {
  const pin = s.page.locator('.radial-globe__pins a[href="/games"]');
  if (entry === 'click') {
    // A pointer click (detail 1): the pin may sit on the far side of the sphere
    // for a real mouse, so dispatch the event the browser would.
    await pin.evaluate((a) =>
      a.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }),
      ),
    );
  } else if (entry === 'enter') {
    await pin.focus();
    await s.page.keyboard.press('Enter');
  } else {
    // Hold-release: turn the globe to /games with focus, then press on empty
    // overlay (the catcher is a drag surface), let the ring fill, let go.
    await pin.focus();
    await s.page.waitForTimeout(1200);
    const { width, height } = s.page.viewportSize();
    const x = Math.round(width * 0.12);
    const y = Math.round(height * 0.5);
    await s.page.mouse.move(x, y);
    await s.page.mouse.down();
    // The ring fills with frame time, and under software GL on a busy box that
    // is far slower than the 260–620 ms a device takes: release only on a full
    // ring (a release on a partial one is, correctly, not a navigation).
    await s.page.waitForFunction(
      () => {
        const style = document.querySelector('.radial-globe__reticle')?.getAttribute('style') ?? '';
        return Number(/--fill:\s*([\d.]+)/.exec(style)?.[1] ?? 0) >= 0.995;
      },
      null,
      { timeout: 60_000, polling: 'raf' },
    );
    await s.page.mouse.up();
  }
}

/** Run one confirm-by-entry scenario end to end. */
async function entryScenario(entry) {
  const name = `entry-${entry}`;
  const { s, errors } = await fresh();
  try {
    await untilReady(s);
    await openHub(s);
    await s.clearMarks();
    await confirm(s, entry);

    const start = await s.waitForMark(EVERSION_MARKS.start, { timeout: 20_000 });
    check(
      name,
      start.detail?.entry === entry,
      `start.entry=${start.detail?.entry}, wanted ${entry}`,
    );
    check(name, (await phase(s)) === 'everting', `phase at start was ${await phase(s)}`);
    const urlAtStart = new URL(s.page.url()).pathname;
    check(
      name,
      urlAtStart === '/games',
      `URL at start was ${urlAtStart} (navigate happens at start)`,
    );

    // Screenshots: mid-WRAP, mid-EVERSION, mid-UNWRAP (entry-release only).
    if (entry === 'release') {
      // WRAP begins at the first presented frame (`cover`), which on a software
      // GL is seconds after `start`: time the shot off the mark, not the clock.
      await s.waitForMark(EVERSION_MARKS.cover, { timeout: RUN_MS });
      await s.page.waitForTimeout(300);
      await shot(s.page, 'mid-wrap');
      await s.waitForMark(EVERSION_MARKS.evert, { timeout: 20_000 });
      await s.page.waitForTimeout(1500);
      await shot(s.page, 'mid-eversion');
      await s.waitForMark(EVERSION_MARKS.unwrap, { timeout: RUN_MS });
      await s.page.waitForTimeout(350);
      await shot(s.page, 'mid-unwrap');
    }

    await s.waitForMark(EVERSION_MARKS.done, { timeout: RUN_MS });
    const marks = await s.marks();
    const order = ['start', 'cover', 'evert', 'gateOpen', 'unwrap', 'reveal', 'done'].map(
      (n) => EVERSION_MARKS[n],
    );
    const seen = order.map((n) => marks.find((m) => m.name === n)?.startTime);
    check(
      name,
      seen.every((t) => t !== undefined),
      `missing marks: ${JSON.stringify(seen)}`,
    );
    check(
      name,
      seen.every((t, i) => i === 0 || t >= seen[i - 1]),
      `marks out of order: ${seen}`,
    );

    await s.page.waitForFunction(
      () => document.querySelector('.radial-hub')?.getAttribute('data-phase') === 'closed',
      null,
      { timeout: 5000 },
    );
    const after = await s.page.evaluate(() => ({
      path: location.pathname,
      overlay: !!document.querySelector('.eversion-overlay'),
      cover: document.documentElement.classList.contains('eversion-cover'),
      settle: document.documentElement.hasAttribute('data-eversion-settle'),
      orbVisible: getComputedStyle(document.querySelector('.radial-hub__orb')).opacity,
      orbTab: document.querySelector('.radial-hub__orb').tabIndex,
    }));
    check(name, after.path === '/games', `landed on ${after.path}`);
    check(
      name,
      !after.overlay && !after.cover && !after.settle,
      `leftovers: ${JSON.stringify(after)}`,
    );
    check(name, after.orbVisible === '1' && after.orbTab === 0, `orb ${JSON.stringify(after)}`);
    // S#25: focus is where the router leaves it for any navigation - in the new
    // page's `main`, or on the body (the router's default) - and never stranded on
    // the hub, a pin, or the overlay. Read before this script moves focus itself.
    const focus = await s.page.evaluate(() => {
      const a = document.activeElement;
      return {
        tag: a?.tagName ?? null,
        inMain: !!a?.closest?.('main'),
        onBody: a === document.body || a === document.documentElement,
        inHub: !!a?.closest?.('.radial-hub, .eversion-overlay'),
      };
    });
    check(name, !focus.inHub, `focus left inside the hub/overlay: ${JSON.stringify(focus)}`);
    check(
      name,
      focus.inMain || focus.onBody,
      `focus is neither in main nor on body: ${JSON.stringify(focus)}`,
    );
    await s.page.focus('.radial-hub__orb');
    check(
      name,
      await s.page.evaluate(() => document.activeElement?.classList.contains('radial-hub__orb')),
      'orb is not focusable after done',
    );
    check(name, errors.length === 0, `errors: ${errors.join(' | ')}`);
  } finally {
    await s.close();
  }
}

/** Escape / X / outside tap: unchanged dismissal, no run. */
async function dismissScenario(kind) {
  const name = `dismiss-${kind}`;
  const { s, errors } = await fresh();
  try {
    await untilReady(s);
    await openHub(s);
    await s.clearMarks();
    if (kind === 'escape') await s.page.keyboard.press('Escape');
    else if (kind === 'x') await s.page.click('.radial-hub__close');
    else {
      const { width, height } = s.page.viewportSize();
      await s.page.mouse.click(Math.round(width * 0.06), Math.round(height * 0.5));
    }
    await s.page.waitForFunction(
      () => document.querySelector('.radial-hub')?.getAttribute('data-phase') === 'closed',
      null,
      { timeout: 5000 },
    );
    const state = await s.page.evaluate(() => ({
      focusOrb: document.activeElement?.classList.contains('radial-hub__orb'),
      path: location.pathname,
    }));
    check(name, state.focusOrb, 'focus did not return to the orb');
    check(name, state.path === '/', `navigated to ${state.path}`);
    check(name, (await s.marks()).length === 0, 'a dismissal started a run');
    check(name, errors.length === 0, `errors: ${errors.join(' | ')}`);
  } finally {
    await s.close();
  }
}

/** Settings → Appearance → Preview. Needs the page to render for a guest or a provisioned session. */
async function previewScenario() {
  const name = 'preview';
  const { s, errors } = await fresh({ path: '/settings/appearance' });
  try {
    const button = s.page.getByRole('button', { name: 'Preview' });
    await button.waitFor({ timeout: SLOW });
    await untilReady(s);
    await s.clearMarks();
    await button.click();
    await s.waitForMark(EVERSION_MARKS.start, { timeout: RUN_MS });
    const marks = await s.marks();
    const start = marks.find((m) => m.name === EVERSION_MARKS.start);
    check(name, start?.detail?.entry === 'preview', `entry=${start?.detail?.entry}`);
    await s.waitForMark(EVERSION_MARKS.done, { timeout: RUN_MS });
    const path = new URL(s.page.url()).pathname;
    check(name, path === '/settings/appearance', `preview left the page: ${path}`);
    check(name, errors.length === 0, `errors: ${errors.join(' | ')}`);
  } finally {
    await s.close();
  }
}

/** Under reduced motion the hub is today's hub (the effect is on for everyone otherwise). */
async function reducedMotionScenario() {
  const name = 'reduced-motion';
  const { s, errors } = await fresh({ eversion: false, reducedMotion: 'reduce' });
  try {
    await s.page.waitForTimeout(3000);
    await openHub(s);
    await s.page.locator('.radial-globe__pins a[href="/games"]').focus();
    await s.page.keyboard.press('Enter');
    await s.page.waitForURL('**/games', { timeout: SLOW });
    await s.page.waitForTimeout(1000);
    // The post-load warm-up may still run (its `prefetch` mark); no RUN may start.
    const runMarks = (await s.marks()).filter((m) => m.name !== EVERSION_MARKS.prefetch);
    check(
      name,
      runMarks.length === 0,
      `eversion run marks under reduced motion: ${runMarks.map((m) => m.name)}`,
    );
    check(
      name,
      !(await s.page.evaluate(() => !!document.querySelector('.eversion-overlay'))),
      'overlay present under reduced motion',
    );
    check(name, errors.length === 0, `errors: ${errors.join(' | ')}`);
  } finally {
    await s.close();
  }
}

const scenarios = [
  ['entry-release', () => entryScenario('release')],
  ['entry-click', () => entryScenario('click')],
  ['entry-enter', () => entryScenario('enter')],
  ['dismiss-escape', () => dismissScenario('escape')],
  ['dismiss-x', () => dismissScenario('x')],
  ['dismiss-outside', () => dismissScenario('outside')],
  ['preview', previewScenario],
  ['reduced-motion', reducedMotionScenario],
].filter(([n]) => n.includes(ONLY));

console.log(`eversion-hub: ${BASE_URL} profile=${PROFILE} theme=${THEME}`);
for (const [name, run] of scenarios) {
  const t0 = performance.now();
  try {
    await run();
    results.push([name, true]);
    console.log(`PASS ${name} (${Math.round(performance.now() - t0)} ms)`);
  } catch (e) {
    results.push([name, false]);
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
  }
}
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed ? `${failed} scenario(s) failed` : 'all scenarios passed');
process.exit(failed ? 1 : 0);
