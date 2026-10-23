/* global React, ReactDOM -- the page-side globals this script's bundle exposes; referenced only in page callbacks. */
/** Plasmatic Jelly as a whole, in a real browser: every document service mounted the way
 * `hooks/useLiquidInteractions.ts` mounts them, on the real stylesheets, with a real React <Button>.
 * No app server, no database (05-gates-docs-naming.md §1.2 / N10; master plan R7, R9, R12).
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node testing/e2e/jelly-interaction.mjs
 *
 * It asserts what the contract promises, and what the unit gates cannot see:
 * - **Haze:** once the registry and the engine are installed, an ambient slot gets a `.jelly-haze-canvas` and its host
 *   `data-jelly-haze="on"`.
 * - **Carriers vs React:** a `<Button>` re-rendered between text-only and element children never keeps a stray
 *   `.jelly-flow` (React's `textContent` path would orphan or wipe it), never holds two, and `data-jelly-flow="on"`
 *   is set exactly on hosts whose carrier is shown.
 * - **Bounded neighbour motion (R12):** a strong press/release nudges neighbours by ≤ `MOTION_BOUNDS.nudgePx`,
 *   translate only (no size change), at most `nudgeMax` of them, and every one returns to identity. A click on the
 *   page background moves nothing.
 * - **Arcs (R9):** the `.jelly-arc-layer` exists by default, is absent under `html[data-electric-arcs="off"]` and under
 *   `html[data-jelly-motion="still"]`, and comes back when the setting is cleared.
 * - **Frames (R7):** 2 s after the last input the only frames are the ambient clock's (≤ tier clock + slack); after
 *   `IDLE_AFTER_MS` the clock sits on its idle floor (≤ idleClockHz + 1 = the frame-budget rest limit) and is never 0
 *   while haze is visible; under `still` there are ZERO frames 2 s after input.
 * - **Degraded tier:** `.style-high-contrast` removes haze, carriers and the arc layer.
 * - **Teardown** leaves no jelly node or attribute behind.
 *
 * A hidden tab is not exercised: headless Chromium cannot background a page reliably. `ambientHz()` (unit-tested in
 * lib/liquid/glass/__tests__/policy.test.ts and N1 in lib/__tests__/jelly-contract.test.ts) owns that branch.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build as bundle } from 'esbuild';
import { chromium } from 'playwright';

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
      import { jellyBudget, IDLE_AFTER_MS, MOTION_BOUNDS } from './lib/jelly/tiers';

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
      window.__jelly = {
        IDLE_AFTER_MS,
        MOTION_BOUNDS,
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
  window.requestAnimationFrame = (cb) => { window.__raf.calls++; return window.__origRaf(cb); };
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
  executablePath: process.env.CHROMIUM_PATH,
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

  await page.evaluate(() => {
    window.__root = ReactDOM.createRoot(document.getElementById('react-root'));
    window.__render = (kind) =>
      window.__root.render(
        React.createElement(
          window.Button,
          { id: 'rerender' },
          kind === 'text'
            ? 'Text'
            : kind === 'icon'
              ? [React.createElement('span', { key: 'i', 'aria-hidden': true }, '★'), 'Text']
              : kind === 'other'
                ? 'Other text'
                : [React.createElement('span', { key: 'w' }, 'Wrapped')],
        ),
      );
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
    const text = await page.$eval('#rerender', (b) => b.textContent);
    check(
      `<Button> re-render ${i + 1} (${kind}) renders its own content`,
      text.includes(kind === 'wrapped' ? 'Wrapped' : kind === 'other' ? 'Other' : 'Text'),
    );
  }
  check(
    `a <Button> re-render never leaves a stray .jelly-flow${strays.length ? ` — ${strays.join('; ')}` : ''}`,
    // The sequence ends text-only: no carrier may remain in it.
    strays.length === 0 && (await count('#rerender > .jelly-flow')) === 0,
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
    const left = await notAtRest([...neighbourIds, 'hit']);
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
    const left = await notAtRest(neighbourIds);
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
  if (governed.idleClockHz > 0 && hazeNow > 0) {
    check(
      `…and never freezes while haze is visible (R7: ${idleFps.toFixed(1)} fps > 0)`,
      idleFps > 0,
    );
  } else {
    console.log(
      `SKIP R7 no-freeze: the governor reached step ${governed.step} (static haze) on this machine — run on a real GPU`,
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
  await settle(2000);
  const stillFrames = (await frames()) - f0;
  check(`under still there are zero frames 2 s after input (${stillFrames})`, stillFrames === 0);
  await page.evaluate(() => document.documentElement.removeAttribute('data-jelly-motion'));
  await settle(1500);
  check('leaving still brings the haze back', (await count('.jelly-haze-canvas')) >= 1);

  // ── A degraded tier stands the material down ──
  await page.evaluate(() => document.documentElement.classList.add('style-high-contrast'));
  await settle(500);
  check(
    '.style-high-contrast removes haze, carriers and arcs',
    (await count('.jelly-haze-canvas')) === 0 &&
      (await count('.jelly-flow')) === 0 &&
      (await count('.jelly-arc-layer')) === 0,
  );
  await page.evaluate(() => document.documentElement.classList.remove('style-high-contrast'));
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
  console.log(`\n${checks - failures.length}/${checks} checks passed.`);
  if (failures.length) {
    console.log(`FAILED:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
