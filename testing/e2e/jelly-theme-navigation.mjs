/* global localStorage, innerWidth, Element -- referenced inside browser callbacks. */
/** Real-app material regression: BASE_URL (Vite dev), PW_CHANNEL / PW_CHROMIUM,
 * JELLY_AUDIT_OUT. Run after starting Vite; needs no authenticated session. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:7005';
const out = process.env.JELLY_AUDIT_OUT ?? '.cache/jelly-theme-navigation';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});
const results = [];
try {
  for (const theme of ['default', 'graphite']) {
    for (const width of [320, 390, 768, 1440]) {
      const touch = width < 1024;
      const context = await browser.newContext({
        viewport: { width, height: width < 640 ? 844 : 1000 },
        hasTouch: touch,
        isMobile: width < 640,
        ...(width < 640
          ? {
              userAgent:
                'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
            }
          : {}),
      });
      await context.addInitScript(
        ({ theme }) => {
          localStorage.setItem('rmh-style', theme);
          localStorage.setItem('rmh-cookie-consent', 'essential');
          localStorage.setItem('rmh-lang-picked-v1', '1');
          localStorage.setItem('rmh-welcome-seen-v1', '1');
          localStorage.setItem('rmh-whatsnew-seen-calls-and-packs-v1', '1');
        },
        { theme },
      );
      const page = await context.newPage();
      const activate = (locator) => (touch ? locator.tap() : locator.click());
      for (const route of ['/login', '/apps']) {
        await page.goto(base + route, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.liquid-glass-canvas', { timeout: 30000 });
        await page.waitForTimeout(700);
        if (route === '/apps' && width < 640) {
          await page.waitForFunction(() => {
            const hub = document.querySelector('.radial-hub');
            return hub && getComputedStyle(hub).getPropertyValue('--dock-scale').trim();
          });
          await page.waitForTimeout(550);
          const dockError = await page.evaluate(() => {
            const orb = document.querySelector('.radial-hub__orb').getBoundingClientRect();
            const globe = document
              .querySelector('.radial-hub__dock .radial-globe__stage')
              .getBoundingClientRect();
            return Math.hypot(
              orb.x + orb.width / 2 - globe.x - globe.width / 2,
              orb.y + orb.height / 2 - globe.y - globe.height / 2,
            );
          });
          assert(
            dockError < 2,
            `Closed phone globe must sit on the navigation button, not over content (${dockError}px)`,
          );
        }
        const geometry = await page.evaluate(() => ({
          ios: document.documentElement.classList.contains('ios-webkit'),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          spills: [...document.querySelectorAll('.liquid-glass-canvas')].flatMap((canvas) => {
            const host = canvas.parentElement;
            const c = canvas.getBoundingClientRect(),
              h = host.getBoundingClientRect();
            return c.width > h.width + 8 ||
              c.height > h.height + 8 ||
              getComputedStyle(host).position === 'static'
              ? [
                  {
                    host: host.className,
                    canvas: { width: c.width, height: c.height },
                    hostSize: { width: h.width, height: h.height },
                  },
                ]
              : [];
          }),
        }));
        assert(
          geometry.overflow <= 1,
          `${theme} ${width} ${route}: horizontal overflow ${geometry.overflow}`,
        );
        if (width < 640)
          assert(geometry.ios, 'The phone pass must exercise the iOS safe-area contract');
        assert.deepEqual(
          geometry.spills,
          [],
          `${theme} ${width} ${route}: canvas escaped its host`,
        );
        await page.screenshot({ path: `${out}/${theme}-${width}-${route.slice(1)}.png` });
        if (route === '/login') {
          // Re-measure repeatedly: this used to remove the logo's positioning
          // marker and stretch its small circular rim over the entire pane.
          for (const style of ['graphite', 'default', theme]) {
            await page.evaluate((style) => {
              document.documentElement.classList.toggle('style-graphite', style === 'graphite');
            }, style);
            await page.waitForTimeout(80);
          }
          const logo = page.locator('.glass-inset').first();
          assert.equal(await logo.evaluate((el) => getComputedStyle(el).position), 'relative');
          if (width < 640) {
            assert.equal(
              await page.locator('main > .glass-pane').count(),
              0,
              'Phone auth must not draw a viewport-sized slab',
            );
          }
          await activate(page.getByRole('button', { name: 'Continue with email', exact: true }));
          await page.locator('input[type="email"]').waitFor({ state: 'visible' });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        } else {
          assert.equal(
            await page
              .locator('[data-slot="liquid-tabs"][data-jelly-scope="off"] .liquid-glass-canvas')
              .count(),
            0,
            'Flat tabs must share their track rim',
          );
          assert.equal(await page.getByText('Pause ambient motion', { exact: true }).count(), 0);
          await page.evaluate(() => {
            window.__materialSwaps = [];
            const original = Element.prototype.animate;
            Element.prototype.animate = function (frames, options) {
              if (this.closest('.page-root'))
                window.__materialSwaps.push({ frames, duration: options?.duration });
              return original.call(this, frames, options);
            };
          });
          await activate(page.locator('[data-slot="liquid-tabs"] a[href="/games"]'));
          await page.waitForURL('**/games');
          await page.getByRole('heading', { name: 'Games', exact: true }).waitFor();
          await page.waitForTimeout(100);
          assert(
            await page.evaluate(() => window.__materialSwaps.some((s) => s.duration === 220)),
            'Route commit must animate its content',
          );
          const oldCount = await page.evaluate(() => window.__materialSwaps.length);
          await activate(page.locator('[data-slot="liquid-tabs"] a[href="/apps"]'));
          await page.waitForURL('**/apps');
          await page.getByRole('heading', { name: 'Apps', exact: true }).waitFor();
          assert(
            await page.evaluate((count) => window.__materialSwaps.length > count, oldCount),
            'Reverse navigation must animate too',
          );
          if (!touch) {
            await page.evaluate(async () => {
              const { jellyBus } = await import('/lib/jelly/bus.ts');
              window.__scrollPlasma = [];
              jellyBus.on('plasma:level', ({ el, level }) =>
                window.__scrollPlasma.push({ text: el.textContent.slice(0, 80), level }),
              );
              document.documentElement.setAttribute('data-jelly-motion', 'still');
            });
            const card = page.locator('.store-card__link').first();
            const box = await card.boundingBox();
            await page.mouse.move(box.x + box.width / 2, 300);
            await page.waitForTimeout(300);
            await page.evaluate(() => {
              window.__scrollPlasma.length = 0;
            });
            await card.evaluate((el) => {
              const r = el.getBoundingClientRect();
              window.scrollTo(0, window.scrollY + r.top + r.height / 2 - 300);
            });
            await page.waitForTimeout(700);
            assert(
              await page.evaluate(() => window.__scrollPlasma.some((e) => e.level > 0)),
              'Stationary-cursor scroll must wake plasma even with ambient Still',
            );
            await page.evaluate(() => document.documentElement.classList.add('perf-lite'));
            await page.waitForFunction(() =>
              [...document.querySelectorAll('.liquid-glass-canvas')].every(
                (el) => getComputedStyle(el).display === 'none',
              ),
            );
          }
        }
        results.push({ theme, width, route, ...geometry, passed: true });
        console.log(`PASS ${theme} ${width} ${route}`);
      }
      // Close all contexts with the browser after the matrix. Closing a live
      // dev scene capture between cases can broadcast a cancelled Vite request
      // as an HMR error overlay to the next case.
    }
  }
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
