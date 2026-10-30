/**
 * Tap check for the touch overlay (not part of the app): with the touch
 * controls on, every HUD menu button (team, class, voice, the Engineer's and
 * the Spy's PDA menus, the pause menu and its HUD view, and the team / class
 * menus a custom HUD restyles) must be the topmost
 * element at its centre, so a tap
 * reaches it instead of starting the thumbstick under it. Phone landscape and
 * portrait. Exits non-zero when any button is covered.
 *
 *   pnpm exec tsx scripts/tf2-game/hud-harness/tap-check.ts
 */
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../..');
const base = '/opt/pw-browsers';
const chrome = readdirSync(base)
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort()
  .reverse()
  .map((d) => path.join(base, d, 'chrome-linux64', 'chrome'))
  .find(existsSync);
const server = await createServer({
  root: import.meta.dirname,
  configFile: false,
  publicDir: path.join(ROOT, 'public'),
  plugins: [
    tailwindcss(),
    // No API here: `/api/*` answers 404 (not the SPA page), so a custom HUD loads from public/ as in shoot.ts.
    {
      name: 'harness-no-api',
      configureServer(sv: {
        middlewares: {
          use: (
            fn: (
              req: { url?: string },
              res: { statusCode: number; end: () => void },
              next: () => void,
            ) => void,
          ) => void;
        };
      }) {
        sv.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/')) {
            res.statusCode = 404;
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: { alias: { '@': ROOT } },
  esbuild: { jsx: 'automatic' },
  server: { port: 0, host: '127.0.0.1', fs: { allow: [ROOT] }, hmr: false },
  logLevel: 'warn',
});
await server.listen();
const url = server.resolvedUrls!.local[0];
let covered = 0;
const browser = await chromium.launch({ executablePath: chrome });
for (const q of [
  's=joinClass&touch=1',
  's=soldierCp&menu=team&touch=1',
  's=soldierCp&menu=voice&touch=1',
  's=engineerCtf&touch=1',
  's=spyDisguise&touch=1',
  // The Esc menu (the HUD's mainmenuoverride.res), Options, the loadout screen, and the HUD view (pick /
  // edit / export a HUD).
  's=soldierCp&menu=pause&touch=1',
  's=soldierCp&menu=settings:keyboard&touch=1',
  's=soldierCp&menu=advanced&touch=1',
  's=soldierCp&menu=loadout&touch=1',
  's=soldierCp&menu=hud&touch=1',
  's=soldierCp&menu=hud&touch=1&hud=moved',
  // Team and class select drawn from a HUD that restyles them (their hit layer over the HUD's canvas).
  's=joinClass&touch=1&hud=menus',
  's=soldierCp&menu=team&touch=1&hud=menus',
]) {
  for (const size of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${url}?${q}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const touch = document.querySelector('.tf2g-touch');
      // Enabled, reachable buttons only (a disabled one takes no taps; an inert or invisible one — a
      // collapsed tab strip kept only to be measured — cannot be tapped); each is scrolled into view
      // first, as a player scrolls a long menu (the pause menu's HUD view) to reach it.
      const items = [...document.querySelectorAll('button')].filter(
        (b) =>
          !touch?.contains(b) &&
          !b.disabled &&
          !b.closest('[inert]') &&
          getComputedStyle(b).visibility !== 'hidden' &&
          b.getBoundingClientRect().width > 0,
      );
      let ok = 0,
        blocked = 0;
      const bad: string[] = [];
      for (const b of items) {
        b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rc = b.getBoundingClientRect();
        const x = rc.left + rc.width / 2,
          y = rc.top + rc.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const top = document.elementFromPoint(x, y);
        if (top && b.contains(top)) ok++;
        else {
          blocked++;
          bad.push(
            `${b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 20)} -> ${top?.className}`,
          );
        }
      }
      return {
        ok,
        blocked,
        bad: bad.slice(0, 5),
        touch: !!touch,
        customMenu: !!document.querySelector('.tf2g-custom-menu'),
      };
    });
    covered += r.blocked;
    process.stdout.write(`${q} ${size.width}x${size.height} ${JSON.stringify(r)}\n`);
    await ctx.close();
  }
}
await browser.close();
await server.close();
if (covered > 0) {
  process.stderr.write(`${covered} menu button(s) covered by the touch overlay\n`);
  process.exit(1);
}
