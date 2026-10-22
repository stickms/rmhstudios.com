// ─────────────────────────────────────────────────────────────────────────────
// Globe-eversion router & fault edge cases (T33; spec §9.4, §7.5-7.7) — Playwright
// against a RUNNING server. One scripted check per row of the §9.4 table, plus
// the host-readiness rule (a release before the host is ready is a clean,
// immediate fallback).
//
//   # terminal 1 — web tier only. A worktree needs a real `pnpm install` and, if
//   # .env has none, dummy XAI_API_KEY / OPENAI_API_KEY (SSR module init needs them).
//   pnpm exec vite dev --port 7311 --strictPort --host 127.0.0.1
//
//   # terminal 2
//   BASE_URL=http://127.0.0.1:7311 node testing/e2e/eversion-edge.mjs
//
//   Optional: ONLY=<scenario-name-substring>, RUN_MS (ceiling for one run, default
//   300000), VIEW=WxH (default 480x320: the effect is fill-bound on a software GL,
//   and a small canvas keeps a run to tens of seconds instead of minutes).
//
// ## How it drives the page
//
// The hub is covered by `eversion-hub.mjs`. The rows here are about what the
// ROUTER and the PAGE do around a run, so they use the controller's debug slot
// (`?eversion-debug=1` → `window.__eversion.controller.startTo(href)`), which runs
// the real controller, runner, host, renderer and capture against the real
// router with the real DOM overlay — no fakes. Two instruments are installed
// before the page loads:
//
//  - a spy on `Worker.prototype.postMessage` that logs every message the page
//    sends the render side (`{type, at, …}` on the page clock, the marks' clock),
//    which is how "abort was sent", "resize was forwarded once", "visibility was
//    posted" and "no input ever fast-forwards a run" are observed;
//  - `unhandledrejection` / `error` collectors (Playwright's `pageerror` is the
//    second net), so "no console errors or unhandled rejections in any row" is
//    asserted for every scenario.
//
// ## Rows → scenarios
//
//  same-route         destination is the current route         (effect runs, AFTER re-captured)
//  back-forward       browser back during the effect           (abort; reveal onto whatever is live)
//  not-found          navigation to a 404                      (the not-found page is captured)
//  redirect           a redirecting route                      (what the redirect lands on is captured)
//  resize             resize / rotation mid-effect             (one `resize` per frame, forwarded)
//  context-lost       WebGL context lost mid-effect            (cover off, `--fading`, 200 ms, finishes)
//  hidden-tab         tab hidden mid-effect                    (`visibility` posted; loop pauses/resumes; a long absence settles the run)
//  input-never-hurries keys and taps during a run                (ignored: it always plays in full)
//  never-settles      a router that never settles              (waited on to DESTINATION_SETTLE_HARD_MS, then captured as it is)
//  host-not-ready     a release before the host is ready       (synchronous: eligible, init started, then ready)
//
// Software GL is slow and the timeline's dt clamp makes wall time meaningless
// under load, so no assertion here is a wall-clock duration of the effect; the
// only timing assertions are the 200 ms fade and AFTER_CAPTURE_TIMEOUT_MS, each
// with a wide upper bound.
// ─────────────────────────────────────────────────────────────────────────────

/* global Worker, history, performance, KeyboardEvent, PointerEvent, Event, PerformanceObserver, MutationObserver, sessionStorage -- used only inside page.evaluate() / addInitScript() callbacks. */
import { EVERSION_MARKS, openSession, BASE_URL } from './lib/eversion-session.mjs';
import { EVERSION_MEASURES } from '../../lib/eversion/marks.ts';
import { DESTINATION_SETTLE_HARD_MS } from '../../lib/eversion/constants.ts';

const ONLY = process.env.ONLY ?? '';
const SLOW = 120_000;
const RUN_MS = Number(process.env.RUN_MS ?? 300_000);
const [VW, VH] = (process.env.VIEW ?? '480x320').split('x').map(Number);

const results = [];

function check(scenario, cond, message) {
  if (!cond) throw new Error(`[${scenario}] ${message}`);
}

/**
 * A fresh page on `path` with the instruments installed. `main` forces the
 * in-thread host (the demotion key the host reads), which is the only mode whose
 * canvas the page can lose the context of.
 */
async function fresh({ path = '/', main = false } = {}) {
  const s = await openSession({ debug: true });
  const { page } = s;
  await page.setViewportSize({ width: VW, height: VH });
  await page.context().addInitScript((forceMain) => {
    if (forceMain) {
      try {
        sessionStorage.setItem('rmh-eversion-host-demoted', '1');
      } catch {
        /* storage blocked: the worker path runs and the scenario's own check says so */
      }
    }
    const ce = console.error;
    console.error = function (...a) {
      if (String(a[0]).includes('script tag')) window.__scriptTag = new Error().stack;
      return ce.apply(this, a);
    };
    window.__posts = [];
    window.__unhandled = [];
    window.addEventListener('unhandledrejection', (e) =>
      window.__unhandled.push(`unhandledrejection: ${String(e.reason)}`),
    );
    window.addEventListener('error', (e) =>
      window.__unhandled.push(
        `error: ${e.message} ${String(e.error && e.error.stack)
          .replace(/\s+at /g, ' <- ')
          .slice(0, 1200)}`,
      ),
    );
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function spy(message, ...rest) {
      if (message && typeof message.type === 'string') {
        const entry = { type: message.type, at: performance.now() };
        if (message.type === 'resize') entry.viewport = message.viewport;
        if (message.type === 'visibility') entry.hidden = message.hidden;
        if (message.type === 'texture') entry.slot = message.slot;
        window.__posts.push(entry);
      }
      return post.call(this, message, ...rest);
    };
    // Cover / fade bookkeeping for the context-loss row.
    window.__seen = { fadingAt: null, coverOffAfterFade: null, overlayGoneAt: null };
    new MutationObserver(() => {
      const now = performance.now();
      const fading = !!document.querySelector('.eversion-overlay--fading');
      if (fading && window.__seen.fadingAt === null) window.__seen.fadingAt = now;
      if (
        window.__seen.fadingAt !== null &&
        window.__seen.coverOffAfterFade === null &&
        !document.documentElement.classList.contains('eversion-cover')
      )
        window.__seen.coverOffAfterFade = now;
      if (
        window.__seen.fadingAt !== null &&
        window.__seen.overlayGoneAt === null &&
        !document.querySelector('.eversion-overlay')
      )
        window.__seen.overlayGoneAt = now;
    }).observe(document, { subtree: true, childList: true, attributes: true });
  }, main);

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // The dev server 404s the catalogue's image variants in a worktree; that is not this feature's.
    // Two messages the app logs with the effect switched OFF, so they are not this
    // feature's: the catalogue's image variants 404 in a worktree, and React warns
    // when a route is client-rendered before hydration has settled (reproduced with
    // `?eversion` absent: router.navigate('/games') right after load).
    if (
      m.type() === 'error' &&
      !/Failed to load resource|Encountered a script tag while rendering React component/.test(
        m.text(),
      )
    )
      errors.push(
        `console.error: ${m.text().slice(0, 2500)} @${m.location().url}:${m.location().lineNumber}`,
      );
  });
  await s.goto(path, { timeout: SLOW });
  await page.waitForFunction(() => !!window.__eversion?.controller, null, { timeout: SLOW });
  return { s, errors };
}

/** Begin a run toward `href` without waiting for it; `finish` collects it. */
async function begin(s, href) {
  await s.clearMarks();
  await s.page.evaluate((h) => {
    window.__run = null;
    window.__eversion.controller.startTo(h).then(
      (o) => (window.__run = { outcome: o }),
      (e) => (window.__run = { error: String(e) }),
    );
  }, href);
}

async function finish(s) {
  try {
    await s.page.waitForFunction(() => window.__run, null, { timeout: RUN_MS, polling: 500 });
  } catch (e) {
    // Say where the run was, not just that it did not end.
    const state = await s.page
      .evaluate(async () => ({
        controller: window.__eversion.controller.state(),
        loop: await window.__eversion.host?.loop().catch(() => null),
        posts: window.__posts.map((p) => p.type).join(','),
        overlay: !!document.querySelector('.eversion-overlay'),
        seen: window.__seen,
      }))
      .catch((err) => ({ evalFailed: String(err) }));
    const marks = (await s.marks().catch(() => [])).map((m) => m.name.replace('eversion:', ''));
    throw new Error(
      `${e.message.split('\n')[0]} :: ${JSON.stringify(state)} marks=${marks.join(',')}`,
      { cause: e },
    );
  }
  return s.page.evaluate(() => window.__run);
}

/**
 * Resolve with the first mark `name`. The session's own `waitForMark` polls on
 * `requestAnimationFrame`, which a software-GL page can starve for many seconds
 * (the compositor is busy drawing the effect); a timer does not care.
 */
async function waitMark(s, name, { timeout = RUN_MS } = {}) {
  const handle = await s.page.waitForFunction(
    (n) => {
      const hit = performance.getEntriesByName(n, 'mark')[0];
      if (hit) return { name: hit.name, startTime: hit.startTime, detail: hit.detail ?? null };
      // The run already ended without it (a fallback, say): stop waiting and say so.
      return window.__run ? { ended: window.__run } : null;
    },
    name,
    { timeout, polling: 250 },
  );
  const found = await handle.jsonValue();
  if (found.ended) {
    throw new Error(`the run ended without ${name}: ${JSON.stringify(found.ended)}`);
  }
  return found;
}

/** A key press on `window`, which is where the controller listens (capture phase). */
/** Hurry the run through the harness hook: no key or tap speeds a run up (it always plays in full). */
const press = (s) => s.hurry();

/** Press once the effect has covered the screen (the run has real frames to hurry). */
async function fastForwardAtCover(s) {
  await waitMark(s, EVERSION_MARKS.cover, { timeout: RUN_MS });
  await press(s);
}

const posts = (s, type) => s.page.evaluate((t) => window.__posts.filter((p) => p.type === t), type);

const mark = async (s, name) => (await s.marks()).find((m) => m.name === name);

/** What every row must leave behind, and the marks of a completed run. */
async function assertClean(name, s, errors, run, { expectEnd = 'done' } = {}) {
  check(name, !run.error, `startTo rejected: ${run.error}`);
  check(name, run.outcome.fallback === null, `fell back: ${run.outcome.fallback}`);
  check(name, run.outcome.end === expectEnd, `ended ${run.outcome.end}, wanted ${expectEnd}`);
  const left = await s.page.evaluate(() => ({
    overlay: !!document.querySelector('.eversion-overlay'),
    cover: document.documentElement.classList.contains('eversion-cover'),
    settle: document.documentElement.hasAttribute('data-eversion-settle'),
    unhandled: window.__unhandled,
  }));
  check(name, !left.overlay && !left.cover && !left.settle, `leftovers: ${JSON.stringify(left)}`);
  check(name, left.unhandled.length === 0, `unhandled: ${left.unhandled.join(' | ')}`);
  check(
    name,
    errors.length === 0,
    `errors: ${errors.join(' | ')} STACK ${String(await s.page.evaluate(() => window.__scriptTag)).replace(/\s+at /g, ' <- ')}`,
  );
  const done = await mark(s, EVERSION_MARKS.done);
  check(name, done?.detail?.end === expectEnd, `done mark end=${done?.detail?.end}`);
}

/** The ordered marks of a run that went the whole way. */
async function assertFullSequence(name, s, { optional = [] } = {}) {
  const marks = await s.marks();
  const order = ['start', 'cover', 'evert', 'gateOpen', 'unwrap', 'reveal', 'done'];
  const seen = order.map((n) => marks.find((m) => m.name === EVERSION_MARKS[n])?.startTime);
  check(
    name,
    seen.every((t, i) => t !== undefined || optional.includes(order[i])),
    `missing marks: ${JSON.stringify(seen)}`,
  );
  const present = seen.filter((t) => t !== undefined);
  check(
    name,
    present.every((t, i) => i === 0 || t >= present[i - 1]),
    `marks out of order: ${seen}`,
  );
}

const capturedAfter = (s) =>
  s.page.evaluate(
    (m) => performance.getEntriesByName(m, 'measure').length,
    EVERSION_MEASURES.captureAfter,
  );

/* ── The rows ─────────────────────────────────────────────────────────────── */

/** Destination is the current route: the effect runs and AFTER is the same page, re-captured. */
async function sameRoute() {
  const name = 'same-route';
  // `/news`, not `/games`: a server-rendered load of `/games` logs a hydration
  // mismatch (Storefront) with the effect off as well, which is not this feature's.
  const { s, errors } = await fresh({ path: '/news' });
  try {
    await begin(s, '/news');
    await fastForwardAtCover(s);
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    await assertFullSequence(name, s);
    check(name, new URL(s.page.url()).pathname === '/news', `left /news: ${s.page.url()}`);
    check(name, (await capturedAfter(s)) >= 1, 'AFTER was never captured');
    const gate = await mark(s, EVERSION_MARKS.gateOpen);
    check(name, gate?.detail?.reason !== 'abort', `gate reason ${gate?.detail?.reason}`);
  } finally {
    await s.close();
  }
}

/** Back during the effect: abort, and the final reveal crossfades onto what is live (the page we went back to). */
async function backForward() {
  const name = 'back-forward';
  const { s, errors } = await fresh({ path: '/' });
  try {
    // Traverse as soon as the run has started: before AFTER can be captured, so the
    // only way the gate opens early is the abort.
    await s.page.evaluate(() => {
      new PerformanceObserver((list) => {
        if (list.getEntries().some((e) => e.name === 'eversion:start')) {
          setTimeout(() => history.back(), 30);
        }
      }).observe({ type: 'mark' });
    });
    await begin(s, '/games');
    await waitMark(s, EVERSION_MARKS.start, { timeout: RUN_MS });
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    await assertFullSequence(name, s);
    const aborts = await posts(s, 'abort');
    check(name, aborts.length === 1, `abort posted ${aborts.length}x`);
    const gate = await mark(s, EVERSION_MARKS.gateOpen);
    check(name, gate?.detail?.reason === 'abort', `gate reason ${gate?.detail?.reason}`);
    const afterTex = (await posts(s, 'texture')).filter((p) => p.slot === 'after');
    check(
      name,
      afterTex.every((p) => p.at < aborts[0].at),
      'an AFTER texture was uploaded after the abort',
    );
    const path = await s.page.evaluate(() => location.pathname);
    check(name, path === '/', `live page after back is ${path}, wanted /`);
    // The fast-forward channel was not used: abort is its own message.
    check(name, (await posts(s, 'fast-forward')).length === 0, 'abort sent a fast-forward');
  } finally {
    await s.close();
  }
}

/** A 404: the router renders its not-found component and that is what AFTER captures. */
async function notFound() {
  const name = 'not-found';
  const { s, errors } = await fresh({ path: '/' });
  try {
    const href = '/no-such-page-eversion-edge';
    await begin(s, href);
    await fastForwardAtCover(s);
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    await assertFullSequence(name, s);
    check(name, new URL(s.page.url()).pathname === href, `URL is ${s.page.url()}`);
    const text = await s.page.evaluate(() => document.body.innerText);
    check(
      name,
      /not found|404|doesn.t exist|lost/i.test(text),
      `no not-found page rendered: ${text.slice(0, 120)}`,
    );
    check(name, (await capturedAfter(s)) >= 1, 'the error page was never captured as AFTER');
  } finally {
    await s.close();
  }
}

/** A redirect: AFTER is whatever the redirect lands on. */
async function redirect() {
  const name = 'redirect';
  const { s, errors } = await fresh({ path: '/' });
  try {
    await begin(s, '/leaderboard');
    await fastForwardAtCover(s);
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    await assertFullSequence(name, s);
    const url = new URL(s.page.url());
    check(name, url.pathname === '/games', `redirect landed on ${url.pathname}`);
    check(name, (await capturedAfter(s)) >= 1, 'the redirect target was never captured as AFTER');
  } finally {
    await s.close();
  }
}

/** Resize / rotation: one `resize` per frame, carrying the new viewport, forwarded to the render side. */
/** The `position: fixed; inset: 0` box (what the controller reports: the viewport minus the scrollbar gutter). */
const fixedBox = (s) =>
  s.page.evaluate(() => {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;inset:0;visibility:hidden';
    document.documentElement.appendChild(p);
    const r = p.getBoundingClientRect();
    p.remove();
    return { w: r.width, h: r.height };
  });

async function resize() {
  const name = 'resize';
  const { s, errors } = await fresh({ path: '/' });
  try {
    await begin(s, '/games');
    await waitMark(s, EVERSION_MARKS.cover, { timeout: RUN_MS });
    check(name, (await posts(s, 'resize')).length === 0, 'resize posted before any resize');

    await s.page.setViewportSize({ width: VW + 120, height: VH + 60 });
    await s.page.waitForFunction(() => window.__posts.some((p) => p.type === 'resize'), null, {
      timeout: 30_000,
    });
    await s.page.waitForTimeout(600);
    let sent = await posts(s, 'resize');
    check(name, sent.length === 1, `one resize event → ${sent.length} messages`);
    let box = await fixedBox(s);
    check(
      name,
      sent[0].viewport.w === box.w && sent[0].viewport.h === box.h && box.w >= VW + 120 - 20,
      `viewport ${JSON.stringify(sent[0].viewport)}, fixed box ${JSON.stringify(box)}`,
    );

    // A rotation: the size flips, and the page fires a burst of events in one task.
    await s.page.setViewportSize({ width: VH + 60, height: VW + 120 });
    await s.page.evaluate(() => {
      for (let i = 0; i < 12; i++) {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('orientationchange'));
      }
    });
    await s.page.waitForFunction(
      () => window.__posts.filter((p) => p.type === 'resize').length >= 2,
      null,
      {
        timeout: 30_000,
      },
    );
    await s.page.waitForTimeout(600);
    sent = await posts(s, 'resize');
    check(name, sent.length === 2, `a rotation burst → ${sent.length - 1} messages, wanted 1`);
    box = await fixedBox(s);
    check(
      name,
      sent[1].viewport.w === box.w && sent[1].viewport.h === box.h && box.h === VW + 120,
      `viewport ${JSON.stringify(sent[1].viewport)}, fixed box ${JSON.stringify(box)}`,
    );

    // An event that changes nothing says nothing.
    await s.page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await s.page.waitForTimeout(400);
    check(name, (await posts(s, 'resize')).length === 2, 'an unchanged viewport was reported');

    await press(s);
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    await assertFullSequence(name, s);
  } finally {
    await s.close();
  }
}

/** Context lost: cover off at once, the overlay fades over 200 ms, the run finishes as today, and the next run works. */
async function contextLost() {
  const name = 'context-lost';
  const { s, errors } = await fresh({ path: '/', main: true });
  try {
    // Lose the context inside the `cover` mark call itself: a page stalled by the
    // software GL can sit for many seconds between a mark and any observer or poll,
    // and the run would be over by then.
    await s.page.evaluate(() => {
      window.__lost = null;
      const realMark = performance.mark.bind(performance);
      performance.mark = (name, ...rest) => {
        const entry = realMark(name, ...rest);
        if (name === 'eversion:cover' && window.__lost === null) {
          const canvas = document.querySelector('.eversion-overlay canvas');
          const ext = canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context');
          canvas?.addEventListener(
            'webglcontextlost',
            () => (window.__lostEvent = performance.now()),
          );
          ext?.loseContext();
          window.__lost = !!ext;
        }
        return entry;
      };
    });
    await begin(s, '/games');
    const run = await finish(s);
    const mode = (await mark(s, EVERSION_MARKS.start))?.detail?.host;
    check(
      name,
      mode === 'main',
      `host mode ${mode}: the in-thread host is needed to lose its context`,
    );
    check(
      name,
      await s.page.evaluate(() => window.__lost),
      'could not lose the context (no WEBGL_lose_context)',
    );

    try {
      await assertClean(name, s, errors, run, { expectEnd: 'context-lost' });
    } catch (e) {
      const info = await s.page.evaluate(() => ({
        lostEvent: window.__lostEvent,
        seen: window.__seen,
      }));
      const marks = (await s.marks()).map((m) => `${m.name}@${Math.round(m.startTime)}`);
      throw new Error(`${e.message} :: ${JSON.stringify(info)} ${marks.join(' ')}`, { cause: e });
    }
    const seen = await s.page.evaluate(() => window.__seen);
    check(name, seen.fadingAt !== null, 'the overlay never got --fading');
    check(
      name,
      seen.coverOffAfterFade !== null && seen.coverOffAfterFade - seen.fadingAt < 200,
      `eversion-cover was not dropped at the loss: ${JSON.stringify(seen)}`,
    );
    const fadeMs = seen.overlayGoneAt - seen.fadingAt;
    check(
      name,
      fadeMs >= 150 && fadeMs < 3000,
      `overlay stayed ${Math.round(fadeMs)} ms, wanted ~200`,
    );
    const path = await s.page.evaluate(() => location.pathname);
    check(name, path === '/games', `the navigation did not finish as today: ${path}`);

    // The lost canvas is discarded: the next run builds a new one and completes.
    await begin(s, '/');
    await fastForwardAtCover(s);
    const again = await finish(s);
    check(
      name,
      !again.error && again.outcome.fallback === null,
      `next run: ${JSON.stringify(again)}`,
    );
    check(name, again.outcome.end === 'done', `next run ended ${again.outcome.end}`);
  } finally {
    await s.close();
  }
}

/** Hidden tab: `visibility` is posted, the loop pauses (no frames) and resumes on a short absence; a long one settles the run. */
async function hiddenTab() {
  const name = 'hidden-tab';
  const { s, errors } = await fresh({ path: '/' });
  try {
    const setHidden = (hidden) =>
      s.page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => (h ? 'hidden' : 'visible'),
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    // Hold the host debug slot from now: `registerDebug` is a no-op once a
    // client-side navigation has dropped `?eversion-debug` from the URL, so a late
    // `ready` (the warm-up probe's) would otherwise unregister it for good. The
    // slot's methods keep working on the same host.
    await s.page.evaluate(async () => {
      await window.__eversion.controller.warmHost();
      window.__hostSlot = window.__eversion.host;
    });
    const loop = () => s.page.evaluate(() => window.__hostSlot.loop());

    await begin(s, '/games');
    await waitMark(s, EVERSION_MARKS.cover, { timeout: RUN_MS });
    const running = await loop();
    check(
      name,
      running.running && !running.hidden && running.frames > 1,
      `before: ${JSON.stringify(running)}`,
    );

    // The AFTER capture is main-thread work of its own (a DOM clone): on a loaded rig it can hold the page for
    // longer than the grace below, and samples taken behind it would read a run the 1 s grace has (correctly)
    // settled. Hide the tab once it is done, so the hidden window measures the loop, not the capture.
    await s.page.waitForFunction(
      () =>
        window.__posts.some(
          (p) => (p.type === 'texture' && p.slot === 'after') || p.type === 'after-failed',
        ),
      null,
      { timeout: RUN_MS, polling: 100 },
    );
    // A short absence (inside HIDDEN_SETTLE_GRACE_MS, 1 s): the loop pauses and the run is still alive.
    await setHidden(true);
    await s.page.waitForTimeout(400);
    check(
      name,
      (await posts(s, 'visibility')).some((p) => p.hidden === true),
      'visibility:true not posted',
    );
    const h1 = await loop();
    await s.page.waitForTimeout(400);
    const h2 = await loop();
    check(
      name,
      h2.hidden && h2.running && h2.pending === 0 && h2.frames === h1.frames,
      `loop not paused: ${JSON.stringify(h1)} → ${JSON.stringify(h2)}`,
    );

    await setHidden(false);
    check(
      name,
      (await posts(s, 'visibility')).some((p) => p.hidden === false),
      'visibility:false not posted',
    );
    await s.page.waitForFunction(
      (frames) => window.__eversion.host.loop().then((l) => l.frames > frames),
      h2.frames,
      { timeout: 30_000 },
    );

    // A long absence (past HIDDEN_SETTLE_GRACE_MS, review B / spec §7.7): nobody is watching, so the rest of the
    // run is settled without drawing instead of being replayed on return. The loop is not running any more.
    await setHidden(true);
    let settled = await loop();
    for (let i = 0; i < 40 && settled.running; i++) {
      await s.page.waitForTimeout(250);
      settled = await loop();
    }
    check(
      name,
      settled.hidden && !settled.running && settled.pending === 0,
      `run not settled after the grace: ${JSON.stringify(settled)}`,
    );

    await setHidden(false);
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    // A run the render side settled while hidden ends in one synchronous burst (`uncover`, `done`), so the
    // page never gets to mark `reveal` on its own timeline: the one mark a settled run may lack.
    await assertFullSequence(name, s, { optional: ['reveal'] });
  } finally {
    await s.close();
  }
}

/**
 * No input hurries a run (amended 2026-10-20: it always plays in full). Keys and taps land on the effect from its
 * first frame, through the eversion and into the final dissolve; no fast-forward is sent and the run ends as it would.
 */
async function revealInput() {
  const name = 'input-never-hurries';
  const { s, errors } = await fresh({ path: '/' });
  const keysAndTaps = () =>
    s.page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
  try {
    await begin(s, '/games');
    await waitMark(s, EVERSION_MARKS.cover, { timeout: RUN_MS });
    await keysAndTaps();
    await waitMark(s, EVERSION_MARKS.evert, { timeout: RUN_MS });
    await keysAndTaps();
    const reveal = await waitMark(s, EVERSION_MARKS.reveal, { timeout: RUN_MS });
    await keysAndTaps();
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    await assertFullSequence(name, s);
    const ff = await posts(s, 'fast-forward');
    check(
      name,
      ff.length === 0,
      `${ff.length} fast-forward(s) sent (first at ${ff[0]?.at}, reveal at ${reveal.startTime})`,
    );
  } finally {
    await s.close();
  }
}

/**
 * A router whose navigation never settles (amended 2026-10-19: the destination is captured before the animation):
 * the run waits for it to DESTINATION_SETTLE_HARD_MS, then captures the page as it is and plays it.
 */
async function neverSettles() {
  const name = 'never-settles';
  const { s, errors } = await fresh({ path: '/' });
  try {
    // The navigation is issued (the URL changes) but its promise never resolves.
    await s.page.evaluate(() => {
      const router = window.__TSR_ROUTER__;
      const real = router.navigate.bind(router);
      router.navigate = (opts) => {
        real(opts).catch(() => {});
        return new Promise(() => {});
      };
    });
    await begin(s, '/games');
    const start = await waitMark(s, EVERSION_MARKS.start, { timeout: RUN_MS });
    const primed = (await posts(s, 'prime'))[0];
    const waited = start.startTime - primed.at;
    check(
      name,
      waited >= DESTINATION_SETTLE_HARD_MS - 100,
      `started ${Math.round(waited)} ms after the prime, before DESTINATION_SETTLE_HARD_MS (${DESTINATION_SETTLE_HARD_MS})`,
    );
    check(
      name,
      waited < DESTINATION_SETTLE_HARD_MS + 20_000,
      `start took ${Math.round(waited)} ms`,
    );
    const after = (await posts(s, 'texture')).filter((p) => p.slot === 'after');
    check(
      name,
      after.length === 1 && after[0].at < start.startTime,
      'the page was not captured as it was, before the start',
    );
    await press(s);
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    await assertFullSequence(name, s);
    const gate = await mark(s, EVERSION_MARKS.gateOpen);
    check(name, gate?.detail?.reason === 'after-ready', `gate reason ${gate?.detail?.reason}`);
    check(name, (await posts(s, 'after-failed')).length === 0, 'after-failed was posted');
  } finally {
    await s.close();
  }
}

/**
 * A release before the host has finished initialising is NOT a skip (amended
 * 2026-10-18; it used to be an immediate `host-not-ready`): the answer is
 * immediate (no wait in the question itself), eligible, and it starts the init,
 * which the run then waits for (bounded).
 */
async function hostNotReady() {
  const name = 'host-not-ready';
  const { s, errors } = await fresh({ path: '/' });
  try {
    const first = await s.page.evaluate(() => {
      const t0 = performance.now();
      const reason = window.__eversion.controller.ineligibleReason();
      return { reason, ms: performance.now() - t0 };
    });
    check(name, first.reason === null, `cold reason ${first.reason}`);
    check(
      name,
      first.ms < 50,
      `the readiness check took ${first.ms.toFixed(1)} ms (it must not wait)`,
    );
    const ready = await s.page.evaluate(() => window.__eversion.controller.warmHost());
    check(name, ready === true, 'the host never became ready within its init budget');
    const second = await s.page.evaluate(() => window.__eversion.controller.ineligibleReason());
    check(name, second === null, `after init the reason is ${second}`);
    // And a run goes the whole way.
    await begin(s, '/games');
    await fastForwardAtCover(s);
    const run = await finish(s);
    await assertClean(name, s, errors, run);
    await assertFullSequence(name, s);
  } finally {
    await s.close();
  }
}

const scenarios = [
  ['same-route', sameRoute],
  ['back-forward', backForward],
  ['not-found', notFound],
  ['redirect', redirect],
  ['resize', resize],
  ['context-lost', contextLost],
  ['hidden-tab', hiddenTab],
  ['input-never-hurries', revealInput],
  ['never-settles', neverSettles],
  ['host-not-ready', hostNotReady],
].filter(([n]) => n.includes(ONLY));

console.log(`eversion-edge: ${BASE_URL} view=${VW}x${VH}`);
/**
 * The BEFORE capture is a DOM clone on the main thread and, on a software-GL box
 * shared with other jobs, can miss its window for reasons that are not the
 * behaviour under test: the run then falls back (`before-*`) and the row never
 * happens. That, and only that, is retried.
 */
const RETRIES = 2;
const isBeforeFallback = (e) => /"fallback":"before-|ended without .*before-/.test(e.message);

for (const [name, run] of scenarios) {
  const t0 = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      await run();
      results.push([name, true]);
      console.log(
        `PASS ${name} (${Math.round(performance.now() - t0)} ms${attempt ? `, attempt ${attempt + 1}` : ''})`,
      );
      break;
    } catch (e) {
      if (attempt < RETRIES && isBeforeFallback(e)) {
        console.log(`retry ${name}: ${e.message.split('\n')[0]}`);
        continue;
      }
      results.push([name, false]);
      console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
      break;
    }
  }
}
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed ? `${failed} scenario(s) failed` : 'all scenarios passed');
process.exit(failed ? 1 : 0);
