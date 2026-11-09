/* global performance -- the page-side globals this script's bundle exposes; referenced only in page callbacks. */
/** The click arcs, in a real browser: the one jelly service that still draws with JavaScript, mounted the way
 * `lib/jelly/arc-lazy.ts` mounts it (`installElectricArcs(document, { ambient: false })`), on the real stylesheets.
 * No app server, no database. This is the blocking `jelly-e2e` job in `.github/workflows/web-ci.yml`.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium/chrome-linux/chrome node testing/e2e/jelly-interaction.mjs
 *
 * The rest of the material is CSS (hover, press, woken haze, static rim), judged by the unit gates in `lib/__tests__/jelly-*`
 * and by `frame-budget.mjs` on the built app. What only a browser can see about the arcs is asserted here:
 * - **Click charge:** a click deposits charge on the clicked body (`charge:pulse`) and a neighbour in reach takes at most
 *   `CHARGE.hopFraction` of it, and only above `CHARGE.minHopCharge`.
 * - **The flash ledger (WCAG 2.3.1):** under a click storm no one-second window holds more than `FLASH_LEDGER.maxOnsets`
 *   flash onsets, every strike is a jelly surface (never a field or the page), and hop and click arcs never outnumber what
 *   the ledger admitted.
 * - **Preferences, live (R9):** the `.jelly-arc-layer` exists while arcs are on, is absent under
 *   `html[data-electric-arcs="off"]`, and under `html[data-jelly-motion="still"]`, and comes back.
 * - **Rest:** with no input and no arc in flight the click runtime requests no animation frame.
 * - **Teardown** leaves no arc node behind, and the page throws nothing.
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
    loader: 'ts',
    contents: `
      import { installElectricArcs, arcFlashLedger } from './lib/jelly/arcs';
      import { FLASH_LEDGER, CHARGE } from './lib/jelly/tiers';
      import { jellyBus } from './lib/jelly/bus';

      // The click-only runtime the lazy installer mounts; it installs the shared registry itself when nobody has.
      const stop = installElectricArcs(document, { ambient: false });
      const events = { pulse: [], strike: [], admit: [] };
      // Every flash onset the ONE site-wide ledger admits, on the ledger's OWN clock (the renderer asks ahead of time, at
      // the instant the flash will be drawn, so the time of the call is not the flash time).
      const tryOnset = arcFlashLedger.tryOnset.bind(arcFlashLedger);
      arcFlashLedger.tryOnset = (now) => {
        const ok = tryOnset(now);
        if (ok) events.admit.push({ t: now });
        return ok;
      };
      const idOf = (el) => (el && el.id) || (el && el.tagName) || '?';
      jellyBus.on('charge:pulse', (p) => events.pulse.push({ t: performance.now(), id: idOf(p.el), q: p.q }));
      jellyBus.on('arc:strike', (p) => events.strike.push({ t: performance.now(), id: idOf(p.el), kind: p.kind }));
      window.__jelly = { FLASH_LEDGER, CHARGE, events, stop };
    `,
  },
  alias: { '@': root },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
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
const sheets = ['glass-roles', 'jelly-material', 'jelly-arcs', 'jelly-coverage']
  .map((f) => readFileSync(resolve(root, `app/${f}.css`), 'utf8'))
  .join('\n');

// Counts every frame request, installed before the services so every rAF they make is seen.
const probe = `
  window.__raf = { calls: 0 };
  window.__origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    window.__raf.calls++;
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
  [data-slot="button"]{position:relative;min-width:110px;height:44px;padding:0 14px;border-radius:12px}
  #void{height:160px}
  ${sheets}</style>
  <header class="glass-chrome" id="chrome"><b>Chrome</b></header>
  <main>
    <section class="glass-pane" id="pane"><h2 style="margin:0">Pane</h2><p>Arcs strike between these.</p></section>
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
    <div id="void"></div>
  </main>`;

const browser = await chromium.launch({
  // Same resolution as frame-budget.mjs / fouc.mjs: an explicit path, else the sandbox's pinned build, else Playwright's.
  executablePath:
    process.env.CHROMIUM_PATH ??
    (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
  headless: true,
  args: ['--no-sandbox'],
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
  const ev = () => page.evaluate(() => window.__jelly.events);

  // ── The layer exists while arcs are on ──
  await settle(300);
  check('the arc layer exists by default', (await count('.jelly-arc-layer')) === 1);

  // ── Click charge, hops and the flash ledger ──
  {
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
    // `arc:strike` fires once per CONTACT (both ends of a bolt, synchronously), so one flash onset is one distinct
    // timestamp. Every hop and click arc is a flash, so onsets must never outnumber what the ledger admits.
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
    check(
      `the ledger itself never admits more than ${maxOnsets} onsets in any ${windowMs} ms (peak ${peakAdmit})`,
      peakAdmit <= maxOnsets,
    );
    check(
      `hop and click arcs never outnumber the ledger: ${onsets.length} strike onsets ≤ ${admitGroups.length} admitted (${strikes.length} contacts ≤ 2 × ${admitted.length} bolts), ≤ ${maxOnsets} in any ${windowMs} ms (peak ${peakWindow})`,
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

  // ── One isolated click: its charge lands on the body and hops on with at most half ──
  {
    await settle(6000); // the storm's charge decays (CHARGE.decayMs) and the ledger empties
    const p0 = (await ev()).pulse.length;
    const b = await page.locator('#c2').boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(5, 790);
    await settle(2000);
    const pulses = (await ev()).pulse.slice(p0);
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

  // ── Rest: no input, no arc in flight, no frame ──
  await page.mouse.move(900, 700);
  await settle(2500);
  const f0 = await frames();
  await settle(2000);
  const restFrames = (await frames()) - f0;
  check(
    `with no input and no arc in flight there are zero frames (${restFrames})`,
    restFrames === 0,
  );

  // ── Arcs follow the preferences, live ──
  await page.evaluate(() => document.documentElement.setAttribute('data-electric-arcs', 'off'));
  await settle(300);
  check(
    'html[data-electric-arcs="off"] removes the arc layer',
    (await count('.jelly-arc-layer')) === 0,
  );
  await page.evaluate(() => document.documentElement.removeAttribute('data-electric-arcs'));
  await settle(300);
  check('clearing it brings the arc layer back', (await count('.jelly-arc-layer')) === 1);
  await page.evaluate(() => document.documentElement.setAttribute('data-jelly-motion', 'still'));
  await settle(400);
  check('jellyMotion = still removes the arc layer', (await count('.jelly-arc-layer')) === 0);
  await page.evaluate(() => document.documentElement.removeAttribute('data-jelly-motion'));
  await settle(400);
  check('leaving still brings the arc layer back', (await count('.jelly-arc-layer')) === 1);

  // ── Teardown ──
  await page.evaluate(() => window.__jelly.stop());
  await settle(300);
  check('teardown leaves no arc node behind', (await count('.jelly-arc-layer')) === 0);
  if (errors.length) console.log(errors.slice(0, 4));
  check('no browser exceptions', errors.length === 0);
  console.log(`\n${checks - failures.length}/${checks} checks passed, ${failures.length} failed.`);
  if (failures.length) {
    console.log(`FAILED:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
