/** Cross-engine feed regression: native scroll geometry, hover coverage, keyboard and fallback material.
 * LIQUID_BROWSER=chromium|firefox|webkit node testing/e2e/ui-stability.mjs
 * FIREFOX_PATH supports an isolated Firefox launcher on macOS (Playwright #42768).
 * Uses the real wheel component, delegated hover hook, interaction runtime and CSS; no database needed.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import postcss from 'postcss';
import { materialHover } from '../../lib/liquid/hover-css.ts';

const root = resolve(import.meta.dirname, '../..');
const out = join(tmpdir(), 'rmh-ui-stability');
mkdirSync(out, { recursive: true });
const globals = readFileSync(join(root, 'app/globals.css'), 'utf8');
const radial = readFileSync(join(root, 'components/radial/radial.css'), 'utf8');
const material = readFileSync(join(root, 'app/liquid-glass.css'), 'utf8');
const evert = globals.slice(
  globals.indexOf(':root {\n  --evert-in:'),
  globals.indexOf('/* The ghost of the layer'),
);
const ghostCss = globals.slice(
  globals.indexOf('.evert-ghost {'),
  globals.indexOf(
    '@media (hover: hover) and (pointer: fine) {\n  @layer components {\n    [data-evert]',
  ),
);
const hover = globals.slice(
  globals.indexOf(
    '@media (hover: hover) and (pointer: fine) {\n  @layer components {\n    [data-evert]',
  ),
  globals.indexOf('/* Two variants of the layer'),
);
assert.ok(evert.length > 200 && hover.length > 100, 'real eversion rules found');
const wheelCss = radial.slice(
  radial.indexOf('/* ── The wheel'),
  radial.indexOf('/* ── RMHark card'),
);
const cardCss = radial.slice(
  radial.indexOf('/* ── RMHark card'),
  radial.indexOf('.rmhark__head {'),
);
const hoverCss = (
  await postcss([materialHover()]).process(
    `${material} ${evert} ${ghostCss} ${hover} ${wheelCss} ${cardCss}
   .hover-control { min-height:36px; padding:8px; border:1px solid var(--site-border);
     color:var(--site-text); background:transparent; border-radius:var(--site-radius-sm); }
   .hover-control:hover { color:red; background:blue; border-color:green; transform:translateY(-2px); box-shadow:0 4px 8px black }
   .hover-control:focus-visible { outline:2px solid var(--site-accent) }
   .hover-control[aria-selected='true'] { background:var(--site-accent) }`,
    { from: undefined },
  )
).css;
const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { RadialWheel } from './components/radial/RadialWheel';
      import { useEvertPointLayer } from './hooks/useEvertPoint';
      import { installLiquidInteractions } from './lib/liquid/runtime';
      import { installLiquidGlass } from './lib/liquid/glass/engine';
      function Fixture() {
        useEvertPointLayer();
        const items = Array.from({length: 18}, (_, i) => ({id: String(i), node:
          <article className="rmhark glass-fill" data-evert="" id={'card-' + i}>
            <a href={'#post-' + i} className="rmhark__link" data-evert-delegate="">
              <strong>Post {i + 1}</strong>
              <p style={{margin: '12px 0 0'}}>Selectable live text. The card and its glass must move together, with no tilting or hover lift.</p>
              {i % 3 === 0 && <div style={{height: 110, marginTop: 12, background: 'linear-gradient(120deg, var(--site-accent), var(--site-bg))'}} />}
            </a>
            <button onClick={() => window.actionClicks++}>Like</button>
          </article>
        }));
        return <RadialWheel items={items} onEndReached={() => window.endReached++} />;
      }
      window.actionClicks = 0; window.endReached = 0;
      createRoot(document.querySelector('#root')).render(<Fixture />);
      window.stopInteractions = installLiquidInteractions();
      window.startGlass = () => installLiquidGlass();
      window.stopGlass = window.startGlass();`,
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const name = process.env.LIQUID_BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[name];
assert.ok(engine);
const browser = await engine.launch({
  headless: true,
  ...(name === 'firefox' && process.env.FIREFOX_PATH
    ? { executablePath: process.env.FIREFOX_PATH }
    : {}),
});
let checks = 0;
function check(label, value) {
  assert.ok(value, label);
  checks++;
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://rmh-ui-stability.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      @layer components;
      :root { --site-bg:#f1f4fa; --site-text:#10151f; --site-text-muted:#516078; --site-accent:#4a82d8;
        --site-border:#9aa6bb; --site-border-bright:#345; --site-glass-light:white; --site-radius:22px;
        --site-radius-sm:10px; --rad-card-pad:20px; --rad-3:12px; --rad-4:16px; --rad-5:24px;
        --rad-card-gap:20px; --site-floating-reserve:80px; --site-surface-hover:#15203018; }
      .style-graphite { --site-bg:#11141a; --site-text:#f4f6fa; --site-text-muted:#b8c2d1; --site-border:#657085; --site-border-bright:#ccd7ed; }
      .style-high-contrast { --site-bg:#000; --site-text:#fff; --site-border:#fff; --site-border-bright:#fff; }
      * {box-sizing:border-box} body {margin:0;background:var(--site-bg);color:var(--site-text);font:16px system-ui}
      #root {max-width:560px;padding:12px;margin:auto} button {align-self:flex-start;min-height:32px}
      ${hoverCss}
    </style><div id="root"></div>`,
    }),
  );
  await page.goto('https://rmh-ui-stability.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForSelector('#card-0');
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const geometry = () =>
    page.$eval('#card-0', (el) => {
      const link = el.querySelector('a');
      const r = el.getBoundingClientRect(),
        l = link.getBoundingClientRect();
      const c = el.querySelector(':scope > canvas[data-liquid-glass]');
      const cr = c?.getBoundingClientRect();
      const cs = getComputedStyle(el),
        ls = getComputedStyle(link),
        ps = getComputedStyle(el, '::before');
      return {
        x: r.x,
        y: r.y,
        scrollY: window.scrollY,
        width: r.width,
        height: r.height,
        linkX: l.x,
        linkY: l.y,
        linkW: l.width,
        canvasY: cr?.y,
        canvasH: cr?.height,
        clientHeight: el.clientHeight,
        transform: cs.transform,
        slotTransform: getComputedStyle(el.parentElement).transform,
        border: el.clientLeft,
        overflow: ls.overflowX,
        inset: ps.inset,
        scale: ps.scale,
        radius: ps.borderTopLeftRadius,
        cardRadius: cs.borderTopLeftRadius,
        delegated: !link.hasAttribute('data-evert') && !!el.style.getPropertyValue('--evert-x'),
        focus: document.activeElement === link,
      };
    });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const theme of ['', 'style-graphite', 'style-high-contrast']) {
      await page.evaluate((theme) => {
        document.documentElement.className = theme;
        window.scrollTo(0, 0);
      }, theme);
      await page.mouse.move(1, 1);
      await settle();
      const rest = await geometry();
      await page.locator('#card-0 a').hover({ position: { x: 3, y: 40 } });
      await settle(650);
      const hovered = await geometry();
      check(
        `${width}/${theme}: hover never moves/resizes content`,
        Math.abs(rest.y - hovered.y) < 0.2 &&
          rest.height === hovered.height &&
          hovered.transform === 'none',
      );
      check(
        `${width}/${theme}: hover covers the card's inner width`,
        Math.abs(hovered.linkX - hovered.x - hovered.border) < 0.2 &&
          Math.abs(hovered.linkW - (hovered.width - 2 * hovered.border)) < 0.2,
      );
      check(
        `${width}/${theme}: one hover layer covers the entire rounded card`,
        hovered.inset === '0px' &&
          hovered.radius === hovered.cardRadius &&
          hovered.delegated &&
          Math.abs(Number(hovered.scale) - 1) < 0.01,
      );
      check(
        `${width}/${theme}: no horizontal overflow`,
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      );
      await page.screenshot({ path: join(out, `${name}-${width}-${theme || 'daylight'}.png`) });
      await page.mouse.move(1, 1);
      await page.locator('#card-0 a').focus();
      check(`${width}/${theme}: link remains keyboard focusable`, (await geometry()).focus);
      await page.keyboard.press('Enter');
      check(
        `${width}/${theme}: link still navigates`,
        (await page.evaluate(() => location.hash)) === '#post-0',
      );
      await page.locator('#card-0 button').click();
      check(
        `${width}/${theme}: actions work independently`,
        (await page.evaluate(() => window.actionClicks)) > 0,
      );
      await page.evaluate(() => document.activeElement.blur());
      await settle(1400);
      const before = await geometry();
      await page.mouse.wheel(0, 170);
      await settle(150);
      const after = await geometry();
      check(
        `${width}/${theme}: native scroll has no card or slot transform`,
        after.transform === 'none' && after.slotTransform === 'none',
      );
      check(
        `${width}/${theme}: card moves at document speed`,
        after.scrollY > before.scrollY &&
          Math.abs(before.y - after.y - (after.scrollY - before.scrollY)) < 0.5,
      );
      if (after.canvasY !== undefined) {
        check(
          `${width}/${theme}: glass stays attached to its host`,
          Math.abs(after.canvasY - after.y - after.border) < 0.2 &&
            Math.abs(after.canvasH - after.clientHeight) < 0.5,
        );
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    document.documentElement.className = '';
    window.scrollTo(0, 0);
  });
  await settle();
  check('reduced motion leaves feed geometry stable', (await geometry()).slotTransform === 'none');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settle();
  check(
    'pagination observer still fires at the end',
    await page.evaluate(() => window.endReached > 0),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const controls = document.createElement('section');
    controls.id = 'hover-controls';
    controls.style.cssText = 'display:grid;gap:12px;max-width:320px;margin:20px auto;padding:12px';
    controls.innerHTML = `<button id="hover-solid" data-slot="button" class="hover-control">Solid</button>
      <button id="hover-ghost" data-slot="button" data-variant="ghost" class="hover-control">Ghost</button>
      <a id="hover-link" href="#test-link" class="hover-control">Link</a>
      <p><a id="hover-inline" href="#test-inline" class="hover-control">Inline link</a></p>
      <button id="hover-menu" role="menuitem" class="hover-control">Menu item</button>
      <button id="hover-tab" role="tab" aria-selected="true" class="hover-control">Selected tab</button>
      <input id="hover-input" class="hover-control" aria-label="Input" placeholder="Input">
      <textarea id="hover-textarea" class="hover-control" aria-label="Textarea">Textarea</textarea>
      <select id="hover-select" class="hover-control" aria-label="Select"><option>Select</option></select>`;
    document.body.append(controls);
  });
  const colours = (id) =>
    page.$eval(id, (el) => {
      const s = getComputedStyle(el);
      return [s.color, s.backgroundColor, s.borderTopColor, s.transform, s.boxShadow];
    });
  for (const id of [
    'solid',
    'ghost',
    'link',
    'inline',
    'menu',
    'tab',
    'input',
    'textarea',
    'select',
  ]) {
    const selector = '#hover-' + id;
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1);
    await settle(350);
    const rest = await colours(selector);
    await page.locator(selector).hover();
    await settle(650);
    check(
      `${id}: hover preserves resting colours and geometry`,
      JSON.stringify(rest) === JSON.stringify(await colours(selector)),
    );
    const host = ['inline', 'input', 'textarea', 'select'].includes(id)
      ? '.evert-ghost[data-kind="hover"]'
      : selector;
    await page.waitForFunction(
      (host) => document.querySelector(host)?.getAttribute('data-liquid-canvas') === 'on',
      host,
      { timeout: 5000 },
    );
    check(
      `${id}: shared material supplies the optical response`,
      await page.locator(host).evaluate((el) => el.getAttribute('data-liquid-canvas') === 'on'),
    );
  }
  await page.evaluate(() => {
    window.stopGlass();
    window.stopInteractions();
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      value: undefined,
      configurable: true,
    });
  });
  await page.evaluate(() => {
    window.stopGlass = window.startGlass();
  });
  await settle();
  check(
    'no-WebGL fallback contains no shader canvases',
    (await page.locator('canvas[data-liquid-glass]').count()) === 0,
  );
  check('no page errors', errors.length === 0);
  console.log(`${checks} UI stability checks passed on ${name}; screenshots: ${out}`);
} finally {
  await browser.close();
}
