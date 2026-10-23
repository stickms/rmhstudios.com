/** Real shared controls and compiled site CSS, without a database or app server.
 * CHROMIUM_PATH=/path/to/chrome node testing/e2e/site-controls.mjs
 * Checks the three themes at phone/desktop widths, interaction and preferences.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build as bundle } from 'esbuild';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const out = process.env.SITE_CONTROLS_OUT ?? join(tmpdir(), 'rmh-site-controls');
mkdirSync(out, { recursive: true });
const cssBuild = await build({
  configFile: false,
  root,
  logLevel: 'error',
  plugins: [tailwindcss()],
  build: {
    write: false,
    rollupOptions: { input: join(root, 'app/site-tier.css') },
  },
});
const outputs = Array.isArray(cssBuild) ? cssBuild : [cssBuild];
const css = outputs.flatMap((r) => r.output).find((o) => o.fileName.endsWith('.css')).source;
const js = await bundle({
  stdin: {
    resolveDir: root,
    loader: 'tsx',
    contents: `
      import React, {useEffect, useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {LazyMotion, MotionConfig, domMax} from 'framer-motion';
      import {LiquidTabs} from './components/ui/liquid-tabs';
      import {Button} from './components/ui/button';
      import {Card} from './components/ui/card';
      import {installJellyPhysics} from './lib/jelly/physics';
      const tabs = [{id:'latest',label:'Latest'}, {id:'following',label:'Following'},
        {id:'saved',label:'Saved'}, {id:'disabled',label:'Unavailable',disabled:true}];
      function Fixture() {
        useEffect(() => installJellyPhysics(document), []);
        const [value,setValue] = useState('latest');
        return <LazyMotion features={domMax}><MotionConfig reducedMotion="never">
          <main className="vibe-app" data-fluid-press-scope>
            <h1>Community</h1>
            <LiquidTabs tabs={tabs} value={value} onChange={setValue} aria-label="Feed" idBase="feed" />
            <section id="feed-panel" role="tabpanel" aria-labelledby={'feed-tab-'+value}>
              <Card id="post" interactive className="social-post">
                <h2>A place to share what you make</h2>
                <p>Glass stays visible while words remain easy to read and select.</p>
                {/* A link in running text is prose, never a soft body (lib/jelly/physics.ts PROSE_SELECTOR).
                    A BARE link in a card is a card body under the jelly soft-policy, so it would press. */}
                <p>Written by our community. <a href="#author" id="author">Visit the author</a></p>
                <div className="actions">
                  <Button id="primary">New post</Button>
                  <Button id="secondary" variant="secondary">Reply</Button>
                  <Button id="disabled" disabled>Unavailable</Button>
                  <button id="legacy" className="rounded-site">Like</button>
                </div>
                <textarea id="field" className="glass-inset rounded-site" aria-label="Reply" />
              </Card>
            </section>
            <LiquidTabs tabs={tabs.slice(0,3)} value="latest" aria-label="Sections"
              renderTab={(tab,{active,...props})=><a {...props} href={'#'+tab.id} />} />
            <button id="circle" className="rounded-full" aria-label="Circular action">+</button>
            <button id="opt-out" data-fluid-press="none">Gesture control</button>
            <div data-gesture="drag"><button id="drag">Drag handle</button></div>
          </main>
        </MotionConfig></LazyMotion>;
      }
      createRoot(document.getElementById('root')).render(<Fixture/>);
    `,
  },
  alias: { '@': root },
  jsx: 'automatic',
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
});
let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS ${name}`);
}
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://site-controls.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${css}\n${readFileSync(join(root, 'components/feed/feed.css'), 'utf8')}
      body{margin:0;padding:20px}main{max-width:660px;min-height:0;margin:auto;display:grid;gap:20px;align-content:start}
      h1{font-size:28px;font-weight:700}h2{font-weight:600}.social-post{padding:20px;margin:0}
      .actions{display:flex;flex-wrap:wrap;gap:8px}#legacy,#opt-out,#drag{padding:10px}
      #field{padding:10px}#circle{width:40px;height:40px}
      </style><div id="root"></div>`,
    }),
  );
  await page.goto('https://site-controls.test/');
  await page.addScriptTag({ content: js.outputFiles[0].text });
  await page.waitForSelector('#post');
  const style = (selector, property) =>
    page
      .locator(selector)
      .first()
      .evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);
  for (const theme of ['', 'style-graphite', 'style-high-contrast']) {
    await page.evaluate((theme) => {
      document.documentElement.className = theme;
    }, theme);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 950 });
      const prefix = `${theme || 'daylight'} ${width}`;
      const radius = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--site-control-radius').trim(),
      );
      const actual = await style('#primary', 'border-radius');
      // Resolve the alias token via a real control, then compare all roles.
      check(`${prefix}: radius token present`, Boolean(radius));
      for (const selector of [
        '#secondary',
        '#legacy',
        '#field',
        '[data-slot="liquid-tabs-sheet"]',
      ]) {
        check(
          `${prefix}: ${selector} control radius`,
          (await style(selector, 'border-radius')) === actual,
        );
      }
      const tabRadius = parseFloat(await style('[role="tab"]', 'border-radius'));
      check(`${prefix}: concentric tab corners`, tabRadius === Math.max(0, parseFloat(actual) - 4));
      check(
        `${prefix}: thumb follows tab`,
        (await style('[data-tab-thumb]', 'border-radius')) === `${tabRadius}px`,
      );
      check(
        `${prefix}: panel radius`,
        parseFloat(await style('#post', 'border-radius')) > parseFloat(actual),
      );
      check(
        `${prefix}: explicit circle`,
        parseFloat(await style('#circle', 'border-radius')) > 100,
      );
      const coat = await style('#post', 'background-image');
      check(
        `${prefix}: glass material`,
        theme === 'style-high-contrast' ? coat === 'none' : coat.includes('gradient'),
      );
      check(
        `${prefix}: no page overflow`,
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      );
      await page.screenshot({
        path: join(out, `${theme || 'daylight'}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.evaluate(() => {
    document.documentElement.className = '';
  });
  const restCoat = await style('#post', 'background-image');
  await page.locator('#post').hover();
  check('post hover retains glass coat', (await style('#post', 'background-image')) === restCoat);
  await page.mouse.move(0, 0);
  const restFill = await style('#primary', 'background-color');
  await page.locator('#primary').hover();
  await page.waitForTimeout(250);
  check('primary hover feedback', (await style('#primary', 'background-color')) !== restFill);
  check('legacy control transition', parseFloat(await style('#legacy', 'transition-duration')) > 0);
  await page.getByRole('tab', { name: 'Latest', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  check(
    'arrow key selects and focuses next tab',
    await page
      .getByRole('tab', { name: 'Following', exact: true })
      .evaluate(
        (el) => el.getAttribute('aria-selected') === 'true' && document.activeElement === el,
      ),
  );
  await page.keyboard.press('End');
  check(
    'keyboard skips disabled tab',
    await page
      .getByRole('tab', { name: 'Saved', exact: true })
      .evaluate((el) => el.getAttribute('aria-selected') === 'true'),
  );

  async function press(selector, shouldMove = true) {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    const bounds = await el.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(140);
    const scale = await el.evaluate((el) => el.style.scale);
    check(
      `${selector}: ${shouldMove ? 'press spring' : 'no press motion'} (scale ${scale || 'none'})`,
      // Jelly press squash is volume-preserving and may be anisotropic (`scale: sx sy`, 02 §1.2): every axis sinks.
      shouldMove
        ? Boolean(scale) && scale.split(/\s+/).every((v) => Number(v) < 1)
        : scale === '',
    );
    await page.mouse.up();
    // Jelly: a control still under the pointer keeps its hover body (the dent), so "idle" is measured after the
    // pointer leaves and the release wobble has settled (02 §1.2; settles well inside 1.5 s).
    await page.mouse.move(1, 1);
    await page.waitForTimeout(1500);
    check(
      `${selector}: releases to idle`,
      await el.evaluate(
        (el) =>
          el.style.scale === '' &&
          el.style.translate === '' &&
          el.style.willChange === '' &&
          !el.hasAttribute('data-jelly-body'),
      ),
    );
  }
  for (const selector of ['#primary', '#legacy', '[role="tab"]', 'nav[aria-label="Sections"] a'])
    await press(selector);
  for (const selector of ['#disabled', '#opt-out', '#drag', '#author', '#field'])
    await press(selector, false);
  check(
    'nested links/fields do not press their card',
    await page.locator('#post').evaluate((el) => el.style.scale === ''),
  );
  await page.locator('#legacy').hover();
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(1500);
  check(
    'scroll intent cancels press',
    await page.locator('#legacy').evaluate((el) => el.style.scale === ''),
  );
  await page.mouse.up();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await press('#primary');
  check(
    'OS preference keeps the shared animation scheme',
    parseFloat(await style('#legacy', 'transition-duration')) > 0,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    document.documentElement.classList.add('reduce-motion');
  });
  await press('[role="tab"]');
  check(
    'retired account class cannot override transitions',
    parseFloat(await style('[role="tab"]', 'transition-duration')) > 0,
  );
  await page.evaluate(() => {
    document.documentElement.className = 'reduce-transparency';
  });
  check('reduced transparency removes coat', (await style('#post', 'background-image')) === 'none');
  check('no browser exceptions', errors.length === 0);
  console.log(`${checks} checks passed. Screenshots: ${out}`);
} finally {
  await browser.close();
}
