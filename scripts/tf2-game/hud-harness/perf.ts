/**
 * Per-update cost of a custom HUD in game (not part of the app): mounts the
 * harness with a custom HUD in headless Chromium and drives the renderer
 * (lib/tf2-game/client/custom-hud/renderer.ts) the way the HUD store does,
 * timing each `update`:
 *
 *   steady   — the state is republished unchanged (the common case at 20–30 Hz)
 *   health   — health changes every update (one file rebuilt, one area repainted)
 *   uber     — a Medic's Über builds every update
 *   full     — every file rebuilt and the whole canvas repainted every update
 *              (what drawing the editor's scene naively each update would cost)
 *
 *   pnpm exec tsx scripts/tf2-game/hud-harness/perf.ts [--hud moved|fonts|base] [--size 1920x1080]
 */
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const hud = arg('hud', 'moved');
const [w, h] = arg('size', '1920x1080').split('x').map(Number);

const chrome = readdirSync('/opt/pw-browsers')
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort()
  .reverse()
  .map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux64', 'chrome'))
  .find(existsSync);

const server = await createServer({
  root: import.meta.dirname,
  configFile: false,
  publicDir: path.join(ROOT, 'public'),
  plugins: [
    tailwindcss(),
    {
      name: 'harness-no-api',
      configureServer(s) {
        s.middlewares.use((req, res, next) => {
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? chrome });
try {
  for (const scenario of ['soldierCp', 'medicPayload', 'engineerCtf']) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`${url}?s=${scenario}&hud=${hud}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    // A string, not a function: tsx's helpers (`__name`) do not exist in the page.
    const result = await page.evaluate(`(() => {
      const r = window.__rmhCustomHud;
      if (!r || !r.lastState || !r.lastState.local) return null;
      const base = r.lastState;
      const local = base.local;
      const time = (n, step) => {
        const ms = [];
        for (let i = 0; i < n; i++) {
          const t0 = performance.now();
          step(i);
          ms.push(performance.now() - t0);
        }
        ms.sort((a, b) => a - b);
        const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
        return { avg: +avg.toFixed(3), p95: +ms[Math.floor(ms.length * 0.95)].toFixed(3), max: +ms[ms.length - 1].toFixed(3) };
      };
      return {
        steady: time(300, (i) => r.update({ ...base, now: base.now + i * 0.033 })),
        health: time(300, (i) => r.update({ ...base, now: base.now + i * 0.033, local: { ...local, health: 20 + (i % 150) } })),
        uber: time(300, (i) => r.update({ ...base, now: base.now + i * 0.033, local: { ...local, meters: { ...local.meters, uber: (i % 100) / 100 } } })),
        full: time(100, (i) => {
          if (r.scene) r.scene.invalidate();
          r.fullPaint = true;
          r.update({ ...base, now: base.now + i * 0.033, local: { ...local, health: 20 + (i % 150) } });
        }),
      };
    })()`);
    process.stdout.write(`${hud} ${scenario} ${w}x${h} ${JSON.stringify(result)}\n`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
