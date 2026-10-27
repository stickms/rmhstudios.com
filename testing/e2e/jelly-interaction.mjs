/* global React, ReactDOM, CSS, performance -- the page-side globals this script's bundle exposes; referenced only in page callbacks. */
/** Plasmatic Jelly as a whole, in a real browser: every document service mounted the way
 * `hooks/useLiquidInteractions.ts` mounts them, on the real stylesheets, with a real React <Button>.
 * No app server, no database (05-gates-docs-naming.md §1.2 / N10; master plan R7, R9, R12).
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node testing/e2e/jelly-interaction.mjs
 *
 * It asserts what the contract promises, and what the unit gates cannot see:
 * - **Haze:** once the registry and the engine are installed, an ambient slot gets a `.jelly-haze-canvas` and its host
 *   `data-jelly-haze="on"`.
 * - **Carriers vs React:** a `<Button>` and a bare jelly host re-rendered between text-only and element children
 *   never keep a stray `.jelly-flow` (React's `textContent` path would orphan or wipe it), never hold two, and
 *   `data-jelly-flow="on"` is set exactly on hosts whose carrier is shown.
 * - **Bounded neighbour motion (R12):** a strong press/release nudges neighbours by ≤ `MOTION_BOUNDS.nudgePx`,
 *   translate only (no size change), at most `nudgeMax` of them, and every one returns to identity. A click on the
 *   page background moves nothing.
 * - **Arcs (R9):** the `.jelly-arc-layer` exists by default, is absent under `html[data-electric-arcs="off"]` and under
 *   `html[data-jelly-motion="still"]`, and comes back when the setting is cleared.
 * - **Frames (R7):** 2 s after the last input the only frames are the ambient clock's (≤ tier clock + slack); after
 *   `IDLE_AFTER_MS` the clock sits on its idle floor (≤ idleClockHz + 1 = the frame-budget rest limit) and is never 0
 *   while haze is visible; under `still` there are ZERO frames 2 s after input.
 * - **Dent and lens (#989):** a press on a card sinks a dent under the pointer (`dentOf(el)`, `data-jelly-active`) and
 *   puts the lens filter (`url(#jelly-lens-…)`, from `lib/jelly/lens.ts`) on that card only while it is pressed; a drag
 *   slides the dent; release eases it out and restores the inline filter exactly.
 * - **Plasma level (#989):** hover emits `plasma:level` at `PLASMA.wake`, press at 1, leaving back to 0.
 * - **Click charge (#989):** a click deposits charge (`charge:pulse`); hop and click arcs never outnumber what the flash
 *   ledger admits — no 1 s window holds more than `FLASH_LEDGER.maxOnsets` strikes, even under a click storm.
 * - **Degraded tier:** `.perf-lite` removes haze, carriers and the arc layer.
 * - **Teardown** leaves no jelly node or attribute behind.
 *
 * **On a machine with no GPU** (SwiftShader / llvmpipe — every CI runner) frames are slow and the governor steps down.
 * Its last step keeps a 6 Hz floor (`GOVERNED_FLOOR_HZ`), so R7 "never freezes" is judged on every renderer; only a
 * governed clock of 0 on software GL (an older governor) is reported as `SKIP <name> — <reason>` with the renderer
 * string (testing/e2e/lib/gpu.mjs), counted in the final line and annotated in CI — never passed silently. On hardware
 * GL a 0 Hz clock is a failure. Every other check (budgets, bounds, ledger, rest-return, teardown, zero frames under
 * still) is deterministic and fails for real.
 *
 *   JELLY_ASSUME_GPU=1|0   override the software-GL detection
 *
 * A hidden tab is not exercised: headless Chromium cannot background a page reliably. `ambientHz()` (unit-tested in
 * lib/liquid/glass/__tests__/policy.test.ts and N1 in lib/__tests__/jelly-contract.test.ts) owns that branch.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build as bundle } from 'esbuild';
import { chromium } from 'playwright';
import { annotateSkip, describeRenderer, probeRenderer } from './lib/gpu.mjs';

const root = resolve(import.meta.dirname, '../..');
const js = await bundle({
  stdin: {
    resolveDir: root,
    loader: 'tsx',
    contents: `
      import * as React from 'react';
      import * as ReactDOM from 'react-dom/client';
      import { Button } from './components/ui/button';
      import { installLiquidInteractions } from './lib/liquid/runtime';
      import { installJellyRegistry } from './lib/jelly/registry';
      import { installJellyPhysics } from './lib/jelly/physics';
      import { installJellyFlow } from './lib/jelly/flow-carriers';
      import { installElectricArcs } from './lib/jelly/arcs';
      import { installLiquidGlass, jellyGovernorStep } from './lib/liquid/glass/engine';
      import { governBudget } from './lib/jelly/governor';
      import { jellyBudget, IDLE_AFTER_MS, MOTION_BOUNDS, FLASH_LEDGER, PLASMA, DENT, CHARGE } from './lib/jelly/tiers';
      import { jellyBus } from './lib/jelly/bus';
      import { dentOf } from './lib/jelly/lattice-inputs';
      import { arcFlashLedger } from './lib/jelly/arcs';

      window.React = React;
      window.ReactDOM = ReactDOM;
      window.Button = Button;
      // The same order and wiring as hooks/useLiquidInteractions.ts (synchronously: no idle wait in a fixture).
      const stops = [];
      stops.push(installLiquidInteractions());
      stops.push(installJellyRegistry(document));
      stops.push(installJellyPhysics(document));
      stops.push(installJellyFlow(document, { budget: () => governBudget(jellyBudget(), jellyGovernorStep()) }));
      stops.push(installElectricArcs(document));
      stops.push(installLiquidGlass());
      // #989: every plasma level, charge pulse and arc strike, timestamped, from before the services start.
      const events = { plasma: [], pulse: [], strike: [], press: [], admit: [] };
      // Every flash onset the ONE site-wide ledger admits — the ceiling for every arc drawn. Recorded on the ledger's
      // OWN clock (the \`now\` it is asked about): the renderer asks ahead of time, at the instant the flash will be
      // drawn (renderer.ts admitArc: \`arc.start + strikes[0].at\`), so the time of the call is not the flash time and
      // a window judged on call times can read 4 where the ledger correctly holds 3 (seen on 2-core SwiftShader).
      const tryOnset = arcFlashLedger.tryOnset.bind(arcFlashLedger);
      arcFlashLedger.tryOnset = (now) => {
        const ok = tryOnset(now);
        if (ok) events.admit.push({ t: now, calledAt: performance.now() });
        return ok;
      };
      const idOf = (el) => (el && el.id) || (el && el.tagName) || '?';
      jellyBus.on('plasma:level', (p) => events.plasma.push({ t: performance.now(), id: idOf(p.el), level: p.level }));
      jellyBus.on('charge:pulse', (p) => events.pulse.push({ t: performance.now(), id: idOf(p.el), q: p.q }));
      jellyBus.on('arc:strike', (p) => events.strike.push({ t: performance.now(), id: idOf(p.el), kind: p.kind }));
      document.addEventListener('pointerdown', (e) => {
        const host = e.target.closest && e.target.closest('[id]');
        events.press.push({ t: performance.now(), id: idOf(host) });
      }, { capture: true });
      window.__jelly = {
        IDLE_AFTER_MS,
        MOTION_BOUNDS,
        FLASH_LEDGER,
        PLASMA,
        DENT,
        CHARGE,
        events,
        dent: (id) => {
          const d = dentOf(document.getElementById(id));
          return d && { x: d.x, y: d.y, depth: d.depth, radius: d.radius };
        },
        ledgerCount: () => arcFlashLedger.count(performance.now()),
        budget: () => jellyBudget(),
        governed: () => ({ step: jellyGovernorStep(), ...governBudget(jellyBudget(), jellyGovernorStep()) }),
        stop: () => { for (const s of stops.reverse()) s(); },
      };
    `,
  },
  alias: { '@': root },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
});

// The default theme's token block from globals.css (the one that carries the jelly tokens), so the role knobs resolve
// exactly as on the site without pulling Tailwind into the fixture.
const globals = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
const tokenAt = globals.indexOf('--site-jelly-haze-fill');
const tokens = globals.slice(
  globals.lastIndexOf('\n:root {', tokenAt),
  globals.indexOf('\n}', tokenAt) + 2,
);
assert.ok(tokens.startsWith('\n:root {') && tokens.length > 500, 'found the default token block');
const sheets = ['liquid-glass', 'jelly-material', 'jelly-arcs', 'jelly-coverage']
  .map((f) => readFileSync(resolve(root, `app/${f}.css`), 'utf8'))
  .join('\n');

// Counts every frame request, installed before the services so every rAF they make is seen. The fixture's own
// sampler uses the saved original so it never counts itself.
const probe = `
  window.__raf = { calls: 0 };
  window.__origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    window.__raf.calls++;
    // Who asked for the frame, while a check is tracing (printed on a failure so it names the driver).
    if (window.__raf.trace) window.__raf.trace.push(String(new Error().stack).split('\\n').slice(2, 6).join(' | '));
    return window.__origRaf(cb);
  };
`;

const markup = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  @layer components;
  ${tokens}
  *{box-sizing:border-box} body{margin:0;color:var(--site-text);font:16px system-ui;background:var(--site-bg)}
  header{position:sticky;top:0;height:56px;padding:12px 24px;z-index:10}
  main{padding:24px 40px}
  #pane{width:420px;height:180px;padding:28px;margin:0 0 24px}
  .cards{display:flex;gap:16px;margin-bottom:24px}
  .glass-fill{width:200px;height:110px;padding:18px}
  .row{display:flex;gap:12px;align-items:center;margin-bottom:24px}
  /* Tailwind's \`relative\` from buttonVariants (the fixture has no Tailwind); carriers need a positioned host. */
  [data-slot="button"]{position:relative;min-width:110px;height:44px;padding:0 14px;border-radius:12px}
  #void{height:160px}
  ${sheets}</style>
  <header class="glass-chrome" id="chrome"><b>Chrome</b></header>
  <main>
    <section class="glass-pane" id="pane"><h2 style="margin:0">Pane</h2><p>Haze lives under this text.</p></section>
    <div class="cards">
      <article class="glass-fill" id="c1"><span>One</span></article>
      <article class="glass-fill" id="c2"><span>Two</span></article>
      <article class="glass-fill" id="c3"><span>Three</span></article>
    </div>
    <div class="row" id="row">
      <button data-slot="button" id="n1"><span>North</span></button>
      <button data-slot="button" id="hit"><span id="hit-text">Press</span></button>
      <button data-slot="button" id="n2"><span>South</span></button>
      <button data-slot="button" id="n3"><span>East</span></button>
    </div>
    <div class="row" id="react-root"></div>
    <div id="void"></div>
  </main>`;

const browser = await chromium.launch({
  // Same resolution as frame-budget.mjs / fouc.mjs: an explicit path, else the sandbox's pinned build, else Playwright's.
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
let checks = 0;
const failures = [];
const skipped = [];
/** A check this machine cannot judge (no GPU): printed, counted and annotated — never a silent pass. */
function skip(name, reason) {
  skipped.push(name);
  console.log(`SKIP ${name} — ${reason}`);
  annotateSkip('jelly-interaction SKIP', `${name} — ${reason}`);
}
/** Records and continues, so one run reports every broken promise; the exit code is non-zero if any failed. */
function check(name, condition) {
  checks++;
  if (condition) console.log(`PASS ${name}`);
  else {
    failures.push(name);
    console.log(`FAIL ${name}`);
  }
}
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // The page itself, plus same-origin static assets from public/ (the haze tile the CSS floor uses).
  await page.route('https://jelly-interaction.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: markup });
    const file = resolve(root, 'public', `.${path}`);
    if (file.startsWith(resolve(root, 'public')) && existsSync(file))
      return route.fulfill({ path: file });
    console.log(`(fixture) no asset for ${path}`);
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route(/^(?!https:\/\/jelly-interaction\.test\/)/, (route) => {
    console.log(`(fixture) blocked off-origin request ${route.request().url()}`);
    return route.abort();
  });
  await page.goto('https://jelly-interaction.test/');
  const gpu = await probeRenderer(page);
  console.log(describeRenderer(gpu));
  await page.addScriptTag({ content: probe });
  await page.addScriptTag({ content: js.outputFiles[0].text });
  const settle = (ms) => page.waitForTimeout(ms);
  const frames = () => page.evaluate(() => window.__raf.calls);
  const count = (sel) => page.$$eval(sel, (n) => n.length);
  const budget = await page.evaluate(() => window.__jelly.budget());
  const { IDLE_AFTER_MS, MOTION_BOUNDS } = await page.evaluate(() => ({
    IDLE_AFTER_MS: window.__jelly.IDLE_AFTER_MS,
    MOTION_BOUNDS: window.__jelly.MOTION_BOUNDS,
  }));
  console.log(
    `tier budget: clock ${budget.clockHz} Hz, idle ${budget.idleClockHz} Hz, haze slots ${budget.hazeSlots}, carriers ${budget.carriers}`,
  );

  // ── Haze canvas once the registry + engine are installed ──
  const hazed = await page
    .waitForSelector('[data-jelly-haze="on"] > .jelly-haze-canvas', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('a haze canvas is drawn once the registry and engine are installed', hazed);
  const hazeCount = await count('.jelly-haze-canvas');
  check(
    `haze canvases stay within the ambient slot budget (${hazeCount} ≤ ${budget.hazeSlots})`,
    hazeCount >= 1 && hazeCount <= budget.hazeSlots,
  );
  const hazeZ = await page.$$eval('.jelly-haze-canvas', (n) =>
    n.every(
      (c) => Number(getComputedStyle(c).zIndex) < 0 && getComputedStyle(c).pointerEvents === 'none',
    ),
  );
  check('every haze canvas paints under the text (negative z-index) and takes no input', hazeZ);
  check(
    'the arc layer exists by default (electricArcs = full)',
    (await count('.jelly-arc-layer')) === 1,
  );

  // ── Carriers vs React re-renders ──
  // Two kinds of breakage, reported apart: a STRAY carrier (a node left where it must not be: a text-only host, a
  // second carrier, not the first child) and a STALE attribute (`data-jelly-flow="on"` / `data-liquid-canvas="on"`
  // on a host whose carrier / rim canvas is gone, e.g. after React replaced the host's text via textContent).
  const invariant = () =>
    page.evaluate(() => {
      const stray = [];
      const stale = [];
      const name = (el) => `#${el.id || el.tagName}`;
      const perHost = new Map();
      for (const node of document.querySelectorAll('.jelly-flow')) {
        const host = node.parentElement;
        perHost.set(host, (perHost.get(host) ?? 0) + 1);
        const others = [...host.children].filter((c) => c !== node).length;
        if (others === 0) stray.push(`carrier in text-only ${name(host)}`);
        if (host.firstChild !== node) stray.push(`carrier is not the first child of ${name(host)}`);
        if (!node.hidden && host.getAttribute('data-jelly-flow') !== 'on')
          stale.push(`shown carrier without data-jelly-flow="on" on ${name(host)}`);
      }
      for (const [host, n] of perHost) if (n > 1) stray.push(`${n} carriers in ${name(host)}`);
      for (const host of document.querySelectorAll('[data-jelly-flow="on"]')) {
        const own = [...host.children].find((c) => c.classList.contains('jelly-flow'));
        if (!own || own.hidden)
          stale.push(`data-jelly-flow="on" with no shown carrier on ${name(host)}`);
      }
      for (const host of document.querySelectorAll('[data-liquid-canvas="on"]')) {
        if (![...host.children].some((c) => c.matches('canvas[data-liquid-glass]')))
          stale.push(`data-liquid-canvas="on" with no rim canvas on ${name(host)}`);
      }
      return { stray, stale };
    });
  const carriersBefore = await count('.jelly-flow');
  check(`carriers are attached to element-bearing hosts (${carriersBefore})`, carriersBefore > 0);
  {
    const { stray, stale } = await invariant();
    check('carrier invariant holds before any re-render', stray.length + stale.length === 0);
  }

  // Two hosts get the same children. `<Button>` wraps a plain-string label in its own `data-slot="button-label"`
  // element (components/ui/button.tsx), so it is never text-only to React and legitimately keeps ONE carrier through
  // every render. `#rerender-raw` is a bare jelly host with the children as given: it really does go text-only, so it
  // is the one that exercises React's `textContent` path and must end with no carrier.
  await page.evaluate(() => {
    window.__root = ReactDOM.createRoot(document.getElementById('react-root'));
    const kids = (kind) =>
      kind === 'text'
        ? 'Text'
        : kind === 'icon'
          ? [React.createElement('span', { key: 'i', 'aria-hidden': true }, '★'), 'Text']
          : kind === 'other'
            ? 'Other text'
            : [React.createElement('span', { key: 'w' }, 'Wrapped')];
    window.__render = (kind) =>
      window.__root.render([
        React.createElement(window.Button, { id: 'rerender', key: 'b' }, kids(kind)),
        React.createElement(
          'button',
          {
            id: 'rerender-raw',
            key: 'r',
            type: 'button',
            className: 'glass-fill',
            'data-fluid-press': '',
          },
          kids(kind),
        ),
      ]);
  });
  // No resize or scroll nudge between renders: that is what a real click on a "Save" → "Saved" button looks like, and a
  // nudge (a registry refresh) would hide a host whose carrier React wiped.
  const sequence = ['text', 'icon', 'text', 'wrapped', 'other', 'icon', 'text', 'wrapped', 'text'];
  const strays = [];
  const stales = [];
  for (const [i, kind] of sequence.entries()) {
    await page.evaluate((k) => window.__render(k), kind);
    await settle(400);
    const { stray, stale } = await invariant();
    strays.push(...stray.map((p) => `render ${i + 1} (${kind}): ${p}`));
    stales.push(...stale.map((p) => `render ${i + 1} (${kind}): ${p}`));
    const want = kind === 'wrapped' ? 'Wrapped' : kind === 'other' ? 'Other' : 'Text';
    const text = await page.$eval('#rerender', (b) => b.textContent);
    const raw = await page.$eval('#rerender-raw', (b) => b.textContent);
    check(
      `<Button> re-render ${i + 1} (${kind}) renders its own content`,
      text.includes(want) && raw.includes(want),
    );
  }
  check(
    'a plain-text <Button> label sits in its own element, so React never rewrites the host with textContent',
    (await count('#rerender > [data-slot="button-label"]')) === 1,
  );
  const buttonCarriers = await count('#rerender > .jelly-flow');
  const rawCarriers = await count('#rerender-raw > .jelly-flow');
  check(
    `a re-render never leaves a stray .jelly-flow${strays.length ? ` — ${strays.join('; ')}` : ''}${rawCarriers ? ` — ${rawCarriers} carrier(s) left in the text-only #rerender-raw` : ''}${buttonCarriers > 1 ? ` — ${buttonCarriers} carriers in #rerender` : ''}`,
    // The sequence ends with string children: the bare host is text-only and may hold no carrier; the <Button> keeps
    // its label element and at most one.
    strays.length === 0 && rawCarriers === 0 && buttonCarriers <= 1,
  );
  check(
    `data-jelly-flow="on" (and data-liquid-canvas="on") match carrier / rim presence after every re-render${stales.length ? ` — ${stales.join('; ')}` : ''}`,
    stales.length === 0,
  );
  // A registry refresh (resize) must heal whatever a re-render left behind.
  await page.setViewportSize({ width: 1100, height: 804 });
  await settle(500);
  {
    const { stray, stale } = await invariant();
    check(
      `a registry refresh leaves no stray or stale carrier state${stray.length + stale.length ? ` — ${[...stray, ...stale].join('; ')}` : ''}`,
      stray.length + stale.length === 0,
    );
  }

  // ── Bounded neighbour motion that returns to rest (R12) ──
  const neighbourIds = ['n1', 'n2', 'n3', 'c1', 'c2', 'c3', 'pane'];
  const startSampling = () =>
    page.evaluate((ids) => {
      const rest = Object.fromEntries(
        ids.map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return [id, { x: r.x, y: r.y, w: r.width, h: r.height }];
        }),
      );
      window.__peak = Object.fromEntries(ids.map((id) => [id, { move: 0, size: 0 }]));
      window.__sampling = true;
      const tick = () => {
        for (const id of ids) {
          const r = document.getElementById(id).getBoundingClientRect();
          const p = window.__peak[id];
          p.move = Math.max(p.move, Math.hypot(r.x - rest[id].x, r.y - rest[id].y));
          p.size = Math.max(
            p.size,
            Math.abs(r.width - rest[id].w),
            Math.abs(r.height - rest[id].h),
          );
        }
        if (window.__sampling) window.__origRaf(tick);
      };
      window.__origRaf(tick);
    }, neighbourIds);
  const stopSampling = () =>
    page.evaluate(() => {
      window.__sampling = false;
      return window.__peak;
    });
  /** Ids NOT at rest, with what is left on them ([] = all at rest). */
  const notAtRest = (ids) =>
    page.evaluate(
      (ids) =>
        ids.flatMap((id) => {
          const el = document.getElementById(id);
          const left = [
            el.style.translate && `translate:${el.style.translate}`,
            el.style.scale && `scale:${el.style.scale}`,
            el.hasAttribute('data-jelly-body') &&
              `data-jelly-body=${el.getAttribute('data-jelly-body')}`,
            el.hasAttribute('data-jelly-active') && 'data-jelly-active',
          ].filter(Boolean);
          return left.length ? [`#${id} ${left.join(' ')}`] : [];
        }),
      ids,
    );
  /** Poll until every id is at rest or `ms` pass (software GL frames are slow); returns what is still left. */
  const settledWithin = async (ids, ms) => {
    const end = Date.now() + ms;
    let left = await notAtRest(ids);
    while (left.length && Date.now() < end) {
      await settle(200);
      left = await notAtRest(ids);
    }
    return left;
  };
  const awake = () =>
    page.$$eval('[data-jelly-body]', (n) =>
      n.map(
        (e) =>
          `${e.id ? `#${e.id}` : e.className.split(' ')[0] || e.tagName}=${e.getAttribute('data-jelly-body')}`,
      ),
    );

  // Ambient arcs strike a random admitted pair about every 2 s (R12 gives each struck element a ≤ 1.5 px impulse), so
  // "returns to rest" is measured with `clicks`: the press's own release nudge and click arcs, no ambient strikes.
  await page.evaluate(() => document.documentElement.setAttribute('data-electric-arcs', 'clicks'));
  await page.mouse.move(5, 790);
  await settle(2500);
  await startSampling();
  const hit = await page.locator('#hit').boundingBox();
  await page.mouse.move(hit.x + hit.width * 0.15, hit.y + hit.height * 0.25);
  await page.mouse.down();
  await settle(240);
  await page.mouse.up();
  await page.mouse.move(5, 790);
  await settle(1800);
  const peak = await stopSampling();
  const moved = Object.entries(peak).filter(([, p]) => p.move > 0.01);
  const peakMove = Math.max(0, ...Object.values(peak).map((p) => p.move));
  const peakSize = Math.max(0, ...Object.values(peak).map((p) => p.size));
  console.log(
    `neighbour peaks: ${moved.map(([id, p]) => `${id} ${p.move.toFixed(2)}px`).join(', ') || 'none'}`,
  );
  check(
    `neighbours move ≤ ${MOTION_BOUNDS.nudgePx}px (peak ${peakMove.toFixed(2)}px)`,
    peakMove <= MOTION_BOUNDS.nudgePx + 0.05,
  );
  check(
    `a nudge is translate only: no neighbour changes size (peak ${peakSize.toFixed(3)}px)`,
    peakSize < 0.01,
  );
  check(
    `at most ${MOTION_BOUNDS.nudgeMax} neighbours move (${moved.length})`,
    moved.length <= MOTION_BOUNDS.nudgeMax,
  );
  {
    const left = await settledWithin([...neighbourIds, 'hit'], 4000);
    check(
      `every neighbour and the pressed host return to identity${left.length ? ` — ${left.join('; ')}` : ''}`,
      left.length === 0,
    );
  }

  // A click on the page background: with arcs off nothing moves at all; with arcs on, a click discharge may strike a
  // surface, and the struck element gets the same ≤ nudgePx impulse (R12) and returns to rest.
  const backgroundClick = async () => {
    await startSampling();
    await page.mouse.move(600, 760);
    await page.mouse.down();
    await settle(200);
    await page.mouse.up();
    await settle(1800);
    return Math.max(0, ...Object.values(await stopSampling()).map((p) => p.move));
  };
  await page.evaluate(() => document.documentElement.setAttribute('data-electric-arcs', 'off'));
  await settle(300);
  const offPeak = await backgroundClick();
  check(
    `arcs off: a click on the page background moves nothing (peak ${offPeak.toFixed(3)}px)`,
    offPeak === 0,
  );
  await page.evaluate(() => document.documentElement.setAttribute('data-electric-arcs', 'clicks'));
  await settle(300);
  const arcPeak = await backgroundClick();
  check(
    `arcs on: a background click discharge moves a struck surface ≤ ${MOTION_BOUNDS.nudgePx}px (peak ${arcPeak.toFixed(2)}px)`,
    arcPeak <= MOTION_BOUNDS.nudgePx + 0.05,
  );
  {
    const left = await settledWithin(neighbourIds, 4000);
    check(
      `…and every struck surface returns to identity${left.length ? ` — ${left.join('; ')}` : ''}`,
      left.length === 0,
    );
  }
  {
    // #rerender's own state is reported by the re-render checks above; this one is about the interaction.
    const { stray, stale } = await invariant();
    const rest = [...stray, ...stale].filter((p) => !p.includes('#rerender'));
    check(
      `the carrier invariant still holds after interaction${rest.length ? ` — ${rest.join('; ')}` : ''}`,
      rest.length === 0,
    );
  }

  // ── #989: the press dent and its lens ──
  {
    const ev = () => page.evaluate(() => window.__jelly.events);
    const plasmaBefore = (await ev()).plasma.length;
    const card = await page.locator('#c2').boundingBox();
    const cx = card.x + card.width * 0.4;
    const cy = card.y + card.height * 0.5;
    await page.mouse.move(cx - 30, cy);
    await page.mouse.move(cx, cy, { steps: 4 });
    const wake = await page.evaluate(() => window.__jelly.PLASMA.wake);
    // PLASMA.easeMs eases the level up; on software GL its frames are slow, so wait (bounded) for it to arrive.
    await page
      .waitForFunction(
        ({ from, wake }) =>
          window.__jelly.events.plasma
            .slice(from)
            .some((p) => p.id === 'c2' && Math.abs(p.level - wake) < 0.051),
        { from: plasmaBefore, wake },
        { timeout: 4000, polling: 50 },
      )
      .catch(() => {});
    const hoverLevels = (await ev()).plasma.slice(plasmaBefore).filter((p) => p.id === 'c2');
    check(
      `hover wakes the plasma: plasma:level ≈ PLASMA.wake on #c2 (${hoverLevels.map((p) => p.level.toFixed(2)).join(',') || 'none'})`,
      hoverLevels.some((p) => Math.abs(p.level - wake) < 0.051),
    );
    const lensOf = (id) => page.$eval(`#${id}`, (e) => e.style.filter);
    const lensed = () =>
      page.$$eval('*', (n) =>
        n
          .filter((e) => /url\(["']?#jelly-lens/.test(e.style?.filter ?? ''))
          .map((e) => e.id || e.tagName),
      );
    check('no lens filter before the press', (await lensed()).length === 0);
    await page.mouse.down();
    // PLASMA.easeMs eases the level toward the press target; wait for it to arrive (frames are slow on software GL).
    await page
      .waitForFunction(
        () => window.__jelly.events.plasma.some((p) => p.id === 'c2' && p.level >= 0.95),
        null,
        { timeout: 4000 },
      )
      .catch(() => {});
    const pressed = await page.evaluate(() => ({
      dent: window.__jelly.dent('c2'),
      active: document.getElementById('c2').hasAttribute('data-jelly-active'),
    }));
    const pressLevels = (await ev()).plasma.slice(plasmaBefore).filter((p) => p.id === 'c2');
    console.log(
      `plasma:level on #c2 (ms: level): ${pressLevels.map((p) => `${(p.t - pressLevels[0].t).toFixed(0)}:${p.level.toFixed(2)}`).join(' ')}`,
    );
    check(
      `press dents the card under the pointer (dentOf: ${pressed.dent ? `depth ${pressed.dent.depth.toFixed(2)} at ${pressed.dent.x.toFixed(0)},${pressed.dent.y.toFixed(0)}` : 'null'})`,
      !!pressed.dent && pressed.dent.depth > 0 && Math.abs(pressed.dent.x - (cx - card.x)) < 6,
    );
    check('a dented card carries data-jelly-active', pressed.active);
    check(
      `press brightens the plasma to 1 (${pressLevels.map((p) => p.level.toFixed(2)).join(',')})`,
      pressLevels.some((p) => p.level >= 0.95),
    );
    const lensWhilePressed = await lensed();
    const lensSupported = await page.evaluate(() => CSS.supports('filter', 'url(#jelly-lens)'));
    check(
      `the lens filter is on the pressed card only (${lensWhilePressed.join(',') || 'none'})`,
      lensSupported
        ? lensWhilePressed.length === 1 && lensWhilePressed[0] === 'c2'
        : lensWhilePressed.length === 0,
    );
    // Drag inside the card: the dent slides with the pointer.
    await page.mouse.move(cx + 40, cy, { steps: 6 });
    await settle(200);
    const slid = await page.evaluate(() => window.__jelly.dent('c2'));
    check(
      `drag slides the dent with the pointer (${pressed.dent?.x.toFixed(0)} → ${slid?.x.toFixed(0)})`,
      !!slid && !!pressed.dent && slid.x - pressed.dent.x > 20,
    );
    await page.mouse.up();
    await page.mouse.move(5, 790, { steps: 3 });
    // The ease-out is frame-driven; software GL draws slowly, so wait for the outcome (bounded) instead of a fixed time.
    await page
      .waitForFunction(
        () =>
          window.__jelly.dent('c2') === null &&
          !document.getElementById('c2').hasAttribute('data-jelly-active') &&
          window.__jelly.events.plasma.filter((p) => p.id === 'c2').at(-1)?.level === 0,
        null,
        { timeout: 5000, polling: 100 },
      )
      .catch(() => {});
    await settle(200);
    const after = await page.evaluate(() => ({
      dent: window.__jelly.dent('c2'),
      active: document.getElementById('c2').hasAttribute('data-jelly-active'),
    }));
    check('release eases the dent out (dentOf → null)', after.dent === null);
    check('…removes data-jelly-active', !after.active);
    check(
      `…and removes the lens filter, restoring the inline filter exactly ("${await lensOf('c2')}")`,
      (await lensed()).length === 0 && (await lensOf('c2')) === '',
    );
    const leaveLevels = (await ev()).plasma.slice(plasmaBefore).filter((p) => p.id === 'c2');
    check(
      `leaving lets the plasma sleep (last plasma:level ${leaveLevels.at(-1)?.level ?? 'none'})`,
      leaveLevels.length > 0 && leaveLevels.at(-1).level === 0,
    );
  }

  // ── #989: click charge, hops and the flash ledger ──
  {
    const ev = () => page.evaluate(() => window.__jelly.events);
    const { maxOnsets, windowMs } = await page.evaluate(() => window.__jelly.FLASH_LEDGER);
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-electric-arcs', 'clicks'),
    );
    await settle(1200); // let the ledger window empty
    const before = await ev();
    const p0 = before.pulse.length;
    const s0 = before.strike.length;
    const t0 = await page.evaluate(() => performance.now());
    // A click storm across the card row: far more clicks than the ledger can admit as flashes.
    const ids = ['c1', 'c2', 'c3', 'n1', 'n2', 'n3'];
    for (let i = 0; i < 12; i++) {
      const b = await page.locator(`#${ids[i % ids.length]}`).boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await settle(60);
    }
    await page.mouse.move(5, 790);
    await settle(1500);
    const after = await ev();
    const pulses = after.pulse.slice(p0);
    const admitted = after.admit.filter((a) => a.t >= t0);
    const strikes = after.strike.slice(s0).filter((s) => s.t >= t0);
    check(`a click storm deposits charge (${pulses.length} charge:pulse)`, pulses.length > 0);
    console.log(
      `storm: ${pulses.length} pulses; strikes: ${strikes.map((s) => `${s.kind}→${s.id}`).join(', ') || 'none'}`,
    );
    // \`arc:strike\` fires once per CONTACT (both ends of a bolt, synchronously), so one flash onset is one distinct
    // timestamp. Every hop and click arc is a flash, so onsets must never outnumber what the ledger admits.
    // Contacts of one bolt (and the bolts of one click) land within a couple of ms of each other: group them.
    const group = (ts) =>
      ts.sort((a, b) => a - b).reduce((g, t) => (g.length && t - g.at(-1) < 3 ? g : [...g, t]), []);
    const onsets = group(strikes.map((s) => s.t));
    const admitGroups = group(admitted.map((a) => a.t));
    let peakWindow = 0;
    for (const t of onsets) {
      peakWindow = Math.max(peakWindow, onsets.filter((o) => o >= t && o - t < windowMs).length);
    }
    let peakAdmit = 0;
    for (const a of admitted) {
      peakAdmit = Math.max(
        peakAdmit,
        admitted.filter((o) => o.t >= a.t && o.t - a.t < windowMs).length,
      );
    }
    console.log(
      `ledger: ${admitted.length} admitted (peak ${peakAdmit}/${windowMs} ms); strike onsets at ${onsets.map((t) => (t - t0).toFixed(0)).join(',')}; admits at ${admitted.map((a) => (a.t - t0).toFixed(0)).join(',')}`,
    );
    check(
      `the ledger itself never admits more than ${maxOnsets} onsets in any ${windowMs} ms (peak ${peakAdmit})`,
      peakAdmit <= maxOnsets,
    );
    check(
      `hop and click arcs never outnumber the ledger: ${onsets.length} strike onsets ≤ ${admitGroups.length} admitted (${strikes.length} contacts ≤ 2 × ${admitted.length} bolts), ≤ ${maxOnsets} in any ${windowMs} ms (peak ${peakWindow}; ${strikes.length} contacts over 12 clicks)`,
      onsets.length > 0 &&
        onsets.length <= admitGroups.length &&
        strikes.length <= 2 * admitted.length &&
        peakWindow <= maxOnsets,
    );
    check(
      'every strike lands on a jelly surface, never a field or the page',
      strikes.every((s) => s.id !== 'BODY' && s.id !== 'HTML'),
    );
  }

  // ── #989: one isolated click — its charge lands on the body and hops on with half ──
  {
    await settle(6000); // the storm's charge decays (CHARGE.decayMs) and the ledger empties
    const p0 = await page.evaluate(() => window.__jelly.events.pulse.length);
    const b = await page.locator('#c2').boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(5, 790);
    await settle(2000);
    const pulses = (await page.evaluate(() => window.__jelly.events.pulse)).slice(p0);
    const own = pulses.filter((p) => p.id === 'c2');
    const hops = pulses.filter((p) => p.id !== 'c2');
    const { hopFraction, minHopCharge } = await page.evaluate(() => ({
      hopFraction: window.__jelly.CHARGE.hopFraction,
      minHopCharge: window.__jelly.CHARGE.minHopCharge,
    }));
    console.log(
      `isolated click: ${own.map((p) => `c2 q${p.q.toFixed(2)}`).join(', ') || 'no own pulse'}; hops ${hops.map((p) => `${p.id} q${p.q.toFixed(2)}`).join(', ') || 'none'}`,
    );
    check(`a click deposits charge on the clicked body (${own.length} pulse)`, own.length >= 1);
    const first = own[0]?.q ?? 1;
    check(
      `its charge hops to a neighbour with ≤ ${hopFraction} of it, and stops below ${minHopCharge} (${hops.length} hop(s))`,
      hops.length >= 1 &&
        // A little residual charge on the neighbour may ride along; the carry itself is q · hopFraction.
        hops[0].q <= first * hopFraction + 0.05 &&
        hops.every((h) => h.q >= minHopCharge - 0.01 && h.q <= hopFraction + 0.05),
    );
  }

  // ── Frames: 2 s after input, only the ambient clock ──
  // Ambient arcs are their own, separately budgeted ambient source (≤ 1 per 2 s, N1); `clicks` (still set) keeps click
  // arcs and isolates the clock.
  await page.mouse.move(900, 700);
  await page.mouse.move(905, 705);
  await settle(2000);
  let f0 = await frames();
  await settle(2000);
  const engagedFps = ((await frames()) - f0) / 2;
  check(
    `2 s after input only the ambient clock runs: ${engagedFps} fps ≤ ${budget.clockHz} + 3`,
    engagedFps <= budget.clockHz + 3,
  );
  {
    const bodies = await awake();
    check(
      `…and no soft body is awake${bodies.length ? ` — ${bodies.join(', ')}` : ''}`,
      bodies.length === 0,
    );
  }

  // ── R7: the idle floor — never frozen while haze is visible ──
  await settle(Math.max(0, IDLE_AFTER_MS - 4000 + 1500));
  f0 = await frames();
  await settle(3000);
  const idleFps = ((await frames()) - f0) / 3;
  // The frame-cost governor (lib/jelly/governor.ts) may legitimately step the clock down under load, to 0 at its
  // last step ("static haze"). Software GL in CI-like containers is exactly that load, so the floor asserted is the
  // GOVERNED one, and the step is printed so a 0 is never mistaken for a pass of R7 on real hardware.
  const governed = await page.evaluate(() => window.__jelly.governed());
  const hazeNow = await count('[data-jelly-haze="on"]');
  console.log(
    `governor step ${governed.step}: clock ${governed.clockHz} Hz, idle floor ${governed.idleClockHz} Hz; ${hazeNow} hazy host(s)`,
  );
  check(
    `after IDLE_AFTER_MS the clock sits on its floor: ${idleFps.toFixed(1)} fps ≤ ${budget.idleClockHz} + 1 (the frame-budget rest limit)`,
    idleFps <= budget.idleClockHz + 1,
  );
  const r7 = `…and never freezes while haze is visible (R7: ${idleFps.toFixed(1)} fps > 0)`;
  if (hazeNow === 0) {
    check(`${r7} — no hazy host left to judge it on`, false);
  } else if (governed.idleClockHz > 0) {
    // The governor's last step keeps a floor (GOVERNED_FLOOR_HZ), so the clock must tick on any renderer, software
    // GL included: this is a real check everywhere.
    check(`${r7} [governor step ${governed.step}, floor ${governed.idleClockHz} Hz]`, idleFps > 0);
  } else if (gpu.software) {
    // A governed clock of 0 (static haze) on software GL is the designed answer to slow frames: not judgeable here.
    skip(
      r7,
      `software GL (${gpu.renderer || 'no WebGL'}), governor step ${governed.step} at 0 Hz; run on a real GPU`,
    );
  } else {
    check(
      `${r7} — the governor fell to a 0 Hz clock on hardware GL (step ${governed.step}, ${gpu.renderer})`,
      false,
    );
  }

  // ── Arcs follow the switch, live ──
  await page.evaluate(() => document.documentElement.setAttribute('data-electric-arcs', 'off'));
  await settle(300);
  check(
    'html[data-electric-arcs="off"] removes the arc layer',
    (await count('.jelly-arc-layer')) === 0,
  );
  await page.evaluate(() => document.documentElement.removeAttribute('data-electric-arcs'));
  await settle(300);
  check('clearing it brings the arc layer back', (await count('.jelly-arc-layer')) === 1);

  // ── still: nothing moves on its own ──
  await page.evaluate(() => document.documentElement.setAttribute('data-jelly-motion', 'still'));
  await settle(400);
  check('jellyMotion = still removes the arc layer', (await count('.jelly-arc-layer')) === 0);
  check('jellyMotion = still removes every carrier', (await count('.jelly-flow')) === 0);
  check('jellyMotion = still removes every haze canvas', (await count('.jelly-haze-canvas')) === 0);
  const h2 = await page.locator('#hit').boundingBox();
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await settle(150);
  await page.mouse.up();
  await page.mouse.move(5, 790);
  await settle(2000);
  f0 = await frames();
  await page.evaluate(() => (window.__raf.trace = []));
  await settle(2000);
  const stillFrames = (await frames()) - f0;
  const stillTrace = await page.evaluate(() => {
    const t = window.__raf.trace;
    window.__raf.trace = null;
    return t;
  });
  if (stillFrames)
    console.log(`frames under still requested by:\n  ${[...new Set(stillTrace)].join('\n  ')}`);
  check(`under still there are zero frames 2 s after input (${stillFrames})`, stillFrames === 0);
  await page.evaluate(() => document.documentElement.removeAttribute('data-jelly-motion'));
  await settle(1500);
  check('leaving still brings the haze back', (await count('.jelly-haze-canvas')) >= 1);

  // ── A degraded tier stands the material down ──
  await page.evaluate(() => document.documentElement.classList.add('perf-lite'));
  await settle(500);
  check(
    '.perf-lite removes haze, carriers and arcs',
    (await count('.jelly-haze-canvas')) === 0 &&
      (await count('.jelly-flow')) === 0 &&
      (await count('.jelly-arc-layer')) === 0,
  );
  await page.evaluate(() => document.documentElement.classList.remove('perf-lite'));
  await settle(300);

  // ── Teardown ──
  await page.evaluate(() => {
    window.__root.unmount();
    window.__jelly.stop();
  });
  await settle(300);
  check(
    'teardown leaves no jelly node or attribute behind',
    (await count(
      '.jelly-flow,.jelly-haze-canvas,.jelly-arc-layer,canvas[data-liquid-glass],[data-jelly-flow],[data-jelly-haze],[data-jelly-body],[data-jelly-active]',
    )) === 0,
  );
  if (errors.length) console.log(errors.slice(0, 4));
  check('no browser exceptions', errors.length === 0);
  console.log(
    `\n${checks - failures.length}/${checks} checks passed, ${skipped.length} skipped (GPU-only on ${gpu.software ? 'software' : 'hardware'} GL), ${failures.length} failed.`,
  );
  if (skipped.length) console.log(`SKIPPED:\n- ${skipped.join('\n- ')}`);
  if (failures.length) {
    console.log(`FAILED:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
