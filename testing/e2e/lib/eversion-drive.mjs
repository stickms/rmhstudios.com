// ─────────────────────────────────────────────────────────────────────────────
// Driving the real hub for the eversion e2e suites (T34 behaviour, T35 smoothness).
//
// `eversion-hub.mjs` (T32) is a finished script; the two suites that follow it
// need the same moves — open the hub, wait until the effect is READY rather than
// merely requested, confirm a pin by hold-release / click / Enter, wait for the
// run to end, read what is left behind — as functions they can compose. They
// live here so "confirm a pin" means one thing in both suites.
//
//   const d = await openApp(session, '/');         // loaded, orb present, errors collected
//   await d.openHub();                             // open + wait for BEFORE held + host warm
//   await d.confirm('release', '/games');          // hold-release on the /games pin
//   await d.waitDone();
//
// ## Why readiness is polled, not slept
//
// The runner waits a bounded HOST_READY_TIMEOUT_MS for the render host at
// release and BEFORE_WAIT_MS for the BEFORE picture, and falls back to today's
// navigation when either misses. Under software GL on a shared core
// that is routine on a cold page, and a fallback is correct behaviour the suites
// must not mistake for a failure of the thing they test. So `openHub` waits for
// the `beforeCapture` debug slot to say a bitmap is held when the page was
// loaded with the debug flag, and otherwise for a fixed warm-up (the first hub
// open on a page pays the worker start + shader compile; later ones do not).
// ─────────────────────────────────────────────────────────────────────────────

/* global MouseEvent, performance -- used only inside page.evaluate() callbacks. */
import { EVERSION_MARKS } from './eversion-session.mjs';
import { CAPTURE_EXCLUDE_SELECTORS } from '../../../lib/eversion/constants.ts';

export { CAPTURE_EXCLUDE_SELECTORS };

/** Dev servers compile on first touch; give every navigation room. */
export const SLOW = 120_000;
/** Cold-page warm-up after the hub opens (host init + shader compile); later opens need ~1 s. */
export const HOST_WARM_MS = Number(process.env.HOST_WARM_MS ?? 9000);
/** A whole run at 1-5 fps (a loaded box takes 3+ minutes), plus a cold path: a ceiling, never a target. */
export const RUN_MS = 600_000;

const MARK_ORDER = ['start', 'cover', 'evert', 'gateOpen', 'unwrap', 'reveal', 'done'];

/** Every error the page produces, so a suite can assert S#38 over a whole run. */
export function collectErrors(page, sink = []) {
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // The dev server 404s one asset on every page; that is not this feature's.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
      sink.push(`console.error: ${m.text().slice(0, 300)}`);
  });
  return sink;
}

/**
 * Wrap a session for hub driving. `errors` accumulates console errors and page
 * errors for the life of the page.
 */
export async function openApp(s, path = '/', { errors = [], timeout = SLOW } = {}) {
  collectErrors(s.page, errors);
  await s.goto(path, { timeout });
  await s.page.waitForSelector('.radial-hub__orb', { timeout });
  let warmed = false;
  /** Page-clock instant until which the host may still be compiling after the last open. */
  let warmUntil = 0;
  const page = s.page;

  const phase = () =>
    page.evaluate(() => document.querySelector('.radial-hub')?.getAttribute('data-phase'));

  async function waitPhase(want, timeout = 45_000) {
    await page.waitForFunction(
      (w) => document.querySelector('.radial-hub')?.getAttribute('data-phase') === w,
      want,
      { timeout },
    );
  }

  /**
   * Open the hub and wait until a run started now would not fall back. `defer`
   * returns at once and leaves the warm-up to `confirm('release')`, which holds
   * the pointer down until it has elapsed: a hold-release under software GL takes
   * 10+ s of ring fill, and sleeping through the warm-up first would leave the
   * BEFORE bitmap past its 30 s freshness limit by the time the pointer is let go.
   */
  async function openHub({ warmMs, defer = false } = {}) {
    // A cold dev server can raise Vite's error overlay (dependency re-optimisation); it
    // swallows pointer events and is not the product's.
    await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
    await page.click('.radial-hub__orb');
    await waitPhase('open');
    const debugSlot = await page.evaluate(() => !!window.__eversion?.beforeCapture);
    if (debugSlot) {
      await page
        .waitForFunction(() => window.__eversion.beforeCapture.state().held, null, {
          timeout: 60_000,
          polling: 250,
        })
        .catch(() => {});
    }
    // The host's idle init is `onHubOpened` + 700 ms and then a shader compile;
    // there is no signal for it, so a cold page waits a fixed time, a warm one little.
    const wait = warmMs ?? (warmed ? 1500 : HOST_WARM_MS);
    warmUntil = (await page.evaluate(() => performance.now())) + wait;
    if (!defer) await page.waitForTimeout(wait);
    warmed = true;
  }

  /** The held BEFORE bitmap must be fresh (it is retaken after 30 s) or the run falls back. */
  async function ensureFreshBefore() {
    const debugSlot = await page.evaluate(() => !!window.__eversion?.beforeCapture);
    if (!debugSlot) return;
    await page
      .waitForFunction(
        () => {
          const st = window.__eversion.beforeCapture.state();
          return st.held && st.ageMs !== null && st.ageMs < 12_000;
        },
        null,
        { timeout: 60_000, polling: 250 },
      )
      .catch(() => {});
  }

  /** Confirm the pin for `href` by `entry`: 'release' (hold-release), 'click' or 'enter'. */
  async function confirm(entry, href = '/games') {
    await ensureFreshBefore();
    const pin = page.locator(`.radial-globe__pins a[href="${href}"]`);
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
      await page.keyboard.press('Enter');
    } else {
      // Hold-release: turn the globe to the pin with focus, press on empty overlay
      // (the catcher is a drag surface), let the ring fill, let go.
      await pin.focus();
      // Focus turns the globe to the pin; the reticle has locked on when its list item
      // carries `is-locked`. A fixed wait is not enough when frames take a second each.
      await page.waitForSelector(`.radial-globe__pin-wrap.is-locked > a[href="${href}"]`, {
        timeout: 60_000,
      });
      const { width, height } = page.viewportSize();
      await page.mouse.move(Math.round(width * 0.12), Math.round(height * 0.5));
      await page.mouse.down();
      // The ring fills with frame time; under software GL that is far slower than
      // the 260–620 ms a device takes. Release only on a full ring.
      await page.waitForFunction(
        () => {
          const style =
            document.querySelector('.radial-globe__reticle')?.getAttribute('style') ?? '';
          return Number(/--fill:\s*([\d.]+)/.exec(style)?.[1] ?? 0) >= 0.995;
        },
        null,
        { timeout: 60_000, polling: 'raf' },
      );
      // Let the host finish compiling (see openHub's `defer`), then let go.
      const left = warmUntil - (await page.evaluate(() => performance.now()));
      if (left > 0) await page.waitForTimeout(left);
      await page.mouse.up();
    }
  }

  /**
   * After a confirm: did the effect START? `started` (the `start` mark exists),
   * `fallback` (the runner declined: `reason`), or `today` (the hub took today's
   * navigation without ever involving the runner: ineligible, e.g. the chunk or
   * host was not ready). Returns as soon as one is known, so a test that needs a
   * run can say why it did not get one instead of timing out minutes later.
   */
  async function waitStarted({ timeout = 120_000 } = {}) {
    const handle = await page
      .waitForFunction(
        ([start, fb]) => {
          const hit = (n) => performance.getEntriesByName(n, 'mark')[0];
          if (hit(start)) return { kind: 'started' };
          const f = hit(fb);
          if (f) return { kind: 'fallback', reason: f.detail?.reason ?? '?' };
          const phase = document.querySelector('.radial-hub')?.getAttribute('data-phase');
          return phase === 'closed' ? { kind: 'today' } : null;
        },
        [EVERSION_MARKS.start, EVERSION_MARKS.fallback],
        { timeout, polling: 250 },
      )
      .catch(() => null);
    return handle ? handle.jsonValue() : { kind: 'timeout' };
  }

  /** Wait for `eversion:done` (or `:fallback`) and the hub to close. Returns the marks. */
  async function waitDone({ timeout = RUN_MS } = {}) {
    try {
      // Done, or fallen back, or never started: an INELIGIBLE confirm (chunk or host not
      // ready) is today's navigation with no marks at all, and the hub simply closes.
      await page.waitForFunction(
        ([start, done, fb]) => {
          const has = (n) => performance.getEntriesByName(n, 'mark').length > 0;
          if (has(done) || has(fb)) return true;
          const phase = document.querySelector('.radial-hub')?.getAttribute('data-phase');
          return !has(start) && phase === 'closed';
        },
        [EVERSION_MARKS.start, EVERSION_MARKS.done, EVERSION_MARKS.fallback],
        { timeout, polling: 250 },
      );
    } catch (e) {
      // Say how far it got: "timed out" alone does not tell a stuck run from a slow rig.
      const marks = await s.marks().catch(() => []);
      const at = await page.evaluate(() => performance.now()).catch(() => NaN);
      throw new Error(
        `the run did not finish within ${Math.round(timeout / 1000)} s (page clock ${Math.round(at)} ms); marks so far: ${
          marks
            .map((m) => `${m.name.replace('eversion:', '')}@${Math.round(m.startTime)}`)
            .join(' ') || 'none'
        } (${e.message.split('\n')[0]})`,
        { cause: e },
      );
    }
    await page
      .waitForFunction(
        () => document.querySelector('.radial-hub')?.getAttribute('data-phase') === 'closed',
        null,
        { timeout: 10_000 },
      )
      .catch(() => {});
    return s.marks();
  }

  return {
    s,
    page,
    errors,
    phase,
    waitPhase,
    openHub,
    confirm,
    waitStarted,
    waitDone,
    markWarm: () => {
      warmed = true;
    },
  };
}

/** The marks of one run as `{start, cover, …}` → startTime (ms) or undefined. */
export function markMap(marks) {
  const out = {};
  // `eversion:gate-open` -> `gateOpen`, so the keys match EVERSION_MARKS'.
  for (const m of marks) {
    out[m.name.replace('eversion:', '').replace(/-(\w)/g, (_, c) => c.toUpperCase())] = m.startTime;
  }
  return out;
}

/** Whether the seven run marks are present and in order; returns a reason or null. */
export function markOrderProblem(marks) {
  const seen = MARK_ORDER.map((n) => marks.find((m) => m.name === EVERSION_MARKS[n])?.startTime);
  if (seen.some((t) => t === undefined)) {
    return `missing marks: ${MARK_ORDER.map((n, i) => `${n}=${seen[i] === undefined ? '∅' : Math.round(seen[i])}`).join(' ')}`;
  }
  if (!seen.every((t, i) => i === 0 || t >= seen[i - 1])) return `marks out of order: ${seen}`;
  return null;
}

/** The state a finished run must leave behind (S#25's "nothing left over" list). */
export function leftovers(page) {
  return page.evaluate(() => ({
    path: location.pathname,
    overlay: !!document.querySelector('.eversion-overlay'),
    cover: document.documentElement.classList.contains('eversion-cover'),
    settle: document.documentElement.hasAttribute('data-eversion-settle'),
    orbOpacity: getComputedStyle(document.querySelector('.radial-hub__orb')).opacity,
    orbTab: document.querySelector('.radial-hub__orb').tabIndex,
    focusIn: (() => {
      const a = document.activeElement;
      if (!a || a === document.body) return 'body';
      if (a.closest('main')) return 'main';
      if (a.closest('.radial-hub')) return 'hub';
      return a.tagName.toLowerCase();
    })(),
  }));
}

/**
 * The timeline's slowdown `k` against wall clock, from a run's marks.
 *
 * The timeline clamps each frame's `dt` to MAX_DT (50 ms; spec 7.7), so below
 * 20 fps it runs slower than real time. `cover` is timeline t ~ 50 ms (the second
 * frame) and `evert` is t = 600 ms exactly, so the wall time between them is
 * 550 ms x k. Healthy rigs read ~1; a loaded software-GL box reads 5-30. Never < 1.
 */
export function timelineSlowdown(m) {
  if (m.cover === undefined || m.evert === undefined) return 1;
  return Math.max(1, (m.evert - m.cover) / 550);
}

/**
 * Which server function a `/_serverFn/<id>` URL names: the id is base64url JSON
 * `{ file, export }` in dev, an opaque hash in a production build (`null`).
 */
function serverFnFile(url) {
  try {
    const id = new URL(url).pathname.split('/_serverFn/')[1]?.split('/')[0];
    if (!id) return null;
    const json = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).file ?? null;
  } catch {
    return null;
  }
}

/**
 * Intercept the destination's data (TanStack server-function requests,
 * `/_serverFn/...`). `mode: 'hold'` parks matching requests until `release()`;
 * `mode: 'fail'` answers them 500.
 *
 * Install it BEFORE the page loads and `arm()` it at once for the usual case:
 * the shell preloads every nav destination (`preload: 'viewport'`), so by the
 * time a test clicks, the destination's data is already requested and cached, and
 * a delay armed at the click would delay nothing. A held preload is a pending
 * promise the real navigation joins, so holding from the start delays exactly the
 * navigation.
 *
 * `match` selects the destination's functions by source file (dev: decoded from
 * the URL). In a production build the id is opaque, so every server function
 * matches. `held()` / `failed()` count what was intercepted, so a test can refuse
 * to pass vacuously when the destination fetched nothing.
 */
export async function interceptDestination(page, { mode = 'hold', match = null } = {}) {
  let armed = false;
  let held = 0;
  let failed = 0;
  const files = new Set();
  let open = () => {};
  const gate = new Promise((resolve) => {
    open = resolve;
  });
  const pattern = /\/_serverFn\//;
  const handler = async (route) => {
    const file = serverFnFile(route.request().url());
    const hit = !match || file === null || match.test(file);
    if (!armed || !hit) return route.continue();
    if (file) files.add(file.replace(/\?.*$/, ''));
    if (mode === 'fail') {
      failed++;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'injected: destination failure' }),
      });
    }
    held++;
    await gate;
    return route.continue();
  };
  await page.route(pattern, handler);
  return {
    arm: () => {
      armed = true;
    },
    release: () => open(),
    held: () => held,
    failed: () => failed,
    files: () => [...files],
    dispose: () => page.unroute(pattern, handler).catch(() => {}),
  };
}

/** Sleep in Node until the page's `performance.now()` reaches `t`. */
export async function sleepUntilPage(page, t) {
  const now = await page.evaluate(() => performance.now());
  if (t > now) await new Promise((r) => setTimeout(r, t - now));
}

/**
 * A CSS-pixel viewport screenshot with the capture's exclusion set (spec 6.2: the
 * hub, the overlay, the cookie banner, toasts) made invisible. The BEFORE and AFTER
 * textures are, by design, pictures of the page WITHOUT those, so comparing them to
 * a screenshot that has them measures the exclusion list, not the capture.
 */
export async function pageShot(page) {
  const css = `${CAPTURE_EXCLUDE_SELECTORS.join(',')}{visibility:hidden !important}`;
  const handle = await page.addStyleTag({ content: css });
  try {
    return await page.screenshot({ type: 'png', scale: 'css' });
  } finally {
    await handle.evaluate((el) => el.remove()).catch(() => {});
  }
}

/**
 * The destination delay, in TIMELINE milliseconds, a test should apply for a
 * nominal `delayMs` (the spec's 1.2 s / 4 s) on a rig with slowdown `k`.
 *
 * On a healthy rig (k <= 1.5) it is the spec's number. On a slow one the AFTER
 * settle + capture that the spec's real-time run pays after the data arrives
 * (up to the readiness gate + the capture) shrink to nothing on the timeline
 * (dividing by k), so a literal 4 s would land AFTER the stretch cap's worth of
 * wait and the data would arrive in time. A delay that is meant to MISS the cap
 * (anything past the gate wait's start, 3000) is therefore moved to just past the cap:
 * the planned UNWRAP start (3800) + STRETCH_CAP_MS (2500) + 700 ms.
 */
export function destinationDelayTimeline(delayMs, k) {
  if (k <= 1.5 || delayMs <= 3000) return delayMs;
  return 3800 + 2500 + 700;
}
