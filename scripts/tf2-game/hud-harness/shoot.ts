/**
 * Screenshot harness for the in-game HUDs (not part of the app): serves
 * main.tsx through Vite (Tailwind and the `@` alias as in the app, the TF2
 * Hub's HUD files from public/), opens each view in headless Chromium and
 * writes a PNG per view.
 *
 *   pnpm exec tsx scripts/tf2-game/hud-harness/shoot.ts [--out <dir>] [--only <name,…>]
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const arg = (k: string, d?: string): string | undefined => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const outDir = path.resolve(arg('out', path.join(ROOT, '.render-shots/hud'))!);
const only = arg('only')?.split(',');

const DESKTOP = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };

const VIEWS: Array<{ name: string; query: string; size: { width: number; height: number }; mobile?: boolean }> = [
  { name: 'tf2-soldier-cp', query: 's=soldierCp', size: DESKTOP },
  { name: 'tf2-medic-payload', query: 's=medicPayload', size: DESKTOP },
  { name: 'tf2-engineer-ctf-build', query: 's=engineerCtf', size: DESKTOP },
  { name: 'tf2-sniper-scope-koth', query: 's=sniperKoth', size: DESKTOP },
  { name: 'tf2-spy-freezecam', query: 's=spyDead', size: DESKTOP },
  { name: 'tf2-spy-disguise', query: 's=spyDisguise', size: DESKTOP },
  { name: 'tf2-winpanel', query: 's=winPanel', size: DESKTOP },
  { name: 'tf2-scoreboard', query: 's=soldierCp&scores=1', size: DESKTOP },
  { name: 'tf2-class-menu', query: 's=joinClass', size: DESKTOP },
  { name: 'tf2-team-menu', query: 's=soldierCp&menu=team', size: DESKTOP },
  { name: 'tf2-voice-chat', query: 's=soldierCp&menu=voice', size: DESKTOP },
  { name: 'tf2-pause', query: 's=soldierCp&menu=pause', size: DESKTOP },
  { name: 'tf2-settings', query: 's=soldierCp&menu=settings', size: DESKTOP },
  { name: 'hl2', query: 's=hl2', size: DESKTOP },
  { name: 'portal', query: 's=portal', size: DESKTOP },
  { name: 'phone-tf2-touch', query: 's=soldierCp&touch=1', size: PHONE, mobile: true },
  { name: 'phone-tf2-engineer-touch', query: 's=engineerCtf&touch=1', size: PHONE, mobile: true },
  { name: 'phone-hl2-touch', query: 's=hl2&touch=1', size: PHONE, mobile: true },
  { name: 'phone-portal-touch', query: 's=portal&touch=1', size: PHONE, mobile: true },
  { name: 'phone-landscape-tf2-touch', query: 's=medicPayload&touch=1', size: { width: 844, height: 390 }, mobile: true },
];

function findChromium(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const p = path.join(base, d, 'chrome-linux64', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const server = await createServer({
    root: import.meta.dirname,
    configFile: false,
    publicDir: path.join(ROOT, 'public'),
    plugins: [tailwindcss()],
    resolve: { alias: { '@': ROOT } },
    esbuild: { jsx: 'automatic' },
    server: { port: 0, host: '127.0.0.1', fs: { allow: [ROOT] }, hmr: false },
    logLevel: 'warn',
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite did not start');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? findChromium() });
  try {
    for (const v of VIEWS) {
      if (only && !only.includes(v.name)) continue;
      const ctx = await browser.newContext({ viewport: v.size, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.mobile });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => process.stdout.write(`[${v.name}] page error: ${e.message}\n`));
      await page.goto(`${url}?${v.query}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const file = path.join(outDir, `${v.name}.png`);
      await page.screenshot({ path: file });
      process.stdout.write(`${file}\n`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
