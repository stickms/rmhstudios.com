/**
 * Screenshots and a phone audit of the Source-style menus (not part of the app): /tf2/play's main menu,
 * the Options dialog (every tab, and the Advanced sections), TF2's Esc menu and the loadout screen, on a
 * desktop and two phones (landscape and portrait, touch), through the HUD harness (main.tsx). Each view
 * is audited as phone-check.ts does for touch: no horizontal scroll, every visible control at least
 * 44 × 44 px on a phone and the topmost element at its centre, text fields at least 16 px. Exits
 * non-zero when a view fails.
 *
 *   HARNESS_HUD_BASE=<hud.py out> HARNESS_CATALOG=<catalog.json> \
 *     pnpm exec tsx scripts/tf2-game/hud-harness/menus-shoot.ts [--out <dir>] [--only <name,…>]
 *
 * Without HARNESS_HUD_BASE the menus read public/tf2-hud/base (mainmenuoverride.res, gamemenu.res,
 * classloadoutpanel.res; no option pages, key list or localisation: the fallbacks show).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium, type Page } from 'playwright';
import { harnessApi } from './api';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const arg = (k: string, d?: string): string | undefined => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const outDir = path.resolve(arg('out', path.join(ROOT, '.render-shots/menus'))!);
const only = arg('only')?.split(',');

const DEVICES = [
  { id: 'desktop', size: { width: 1280, height: 720 }, mobile: false },
  { id: 'phone-landscape', size: { width: 844, height: 390 }, mobile: true },
  { id: 'phone-portrait', size: { width: 390, height: 844 }, mobile: true },
];
const TABS = ['keyboard', 'mouse', 'audio', 'video', 'voice', 'multiplayer', 'controller', 'touch'];

interface View {
  name: string;
  query: string;
  /** After load: clicks to reach the state. */
  act?: (page: Page) => Promise<void>;
}

const openAdvanced = async (page: Page) => {
  const b = page.locator('[aria-expanded="false"]').filter({ hasText: /advanced/i }).first();
  if (await b.count()) await b.click();
};

const VIEWS: View[] = [
  { name: 'main-menu', query: 'view=mainmenu' },
  { name: 'main-items', query: 'view=mainmenu', act: (p) => p.locator('[data-command="loadout"]').first().click() },
  { name: 'main-options', query: 'view=mainmenu', act: (p) => p.locator('[data-command="options"]').first().click() },
  { name: 'esc-menu', query: 's=soldierCp&menu=pause' },
  { name: 'loadout', query: 's=soldierCp&menu=loadout' },
  ...TABS.map((tab) => ({ name: `options-${tab}`, query: `s=soldierCp&menu=settings:${tab}` })),
  { name: 'options-keyboard-advanced', query: 's=soldierCp&menu=settings:keyboard', act: openAdvanced },
  { name: 'options-mouse-advanced', query: 's=soldierCp&menu=settings:mouse', act: openAdvanced },
  { name: 'options-video-advanced', query: 's=soldierCp&menu=settings:video', act: openAdvanced },
  { name: 'options-multiplayer-advanced', query: 's=soldierCp&menu=advanced' },
  { name: 'hl2-options', query: 's=hl2&menu=settings:keyboard' },
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

/** Runs in the page: horizontal overflow, small or covered controls, small text fields. */
function audit(touch: boolean) {
  const W = window.innerWidth;
  const problems: string[] = [];
  const over = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - W;
  if (over > 1) problems.push(`horizontal scroll ${over}px`);
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role=dialog]')].filter((d) => d.getBoundingClientRect().width > 0);
  const root: HTMLElement = dialogs.at(-1) ?? document.body;
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab]';
  const name = (e: Element) => (e.getAttribute('aria-label') || e.textContent || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
  let controls = 0;
  for (const e of root.querySelectorAll<HTMLElement>(sel)) {
    const r0 = e.getBoundingClientRect();
    if (r0.width <= 0 || r0.height <= 0 || (e as HTMLButtonElement).disabled || !e.checkVisibility({ visibilityProperty: true })) continue;
    if (e.closest('[aria-hidden="true"],[inert]')) continue;
    controls++;
    e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    let r = e.getBoundingClientRect();
    const label = e.closest('label');
    if (label && (e as HTMLInputElement).type === 'checkbox') r = label.getBoundingClientRect();
    if (touch && (r.width < 44 - 0.5 || r.height < 44 - 0.5)) problems.push(`tap target < 44px: ${name(e)} (${Math.round(r.width)}×${Math.round(r.height)})`);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx >= 0 && cy >= 0 && cx < W && cy < window.innerHeight) {
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== e && !e.contains(hit) && !(label && label.contains(hit))) problems.push(`covered: ${name(e)} by ${hit.tagName.toLowerCase()}.${String((hit as HTMLElement).className).split(' ')[0]}`);
    }
    if ((e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') && (e as HTMLInputElement).type !== 'checkbox' && (e as HTMLInputElement).type !== 'range') {
      if (parseFloat(getComputedStyle(e).fontSize) < 16 && touch) problems.push(`text field < 16px: ${name(e)}`);
    }
  }
  return { controls, problems };
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const server = await createServer({
    root: import.meta.dirname,
    configFile: false,
    publicDir: path.join(ROOT, 'public'),
    plugins: [tailwindcss(), harnessApi()],
    resolve: { alias: { '@': ROOT } },
    esbuild: { jsx: 'automatic' },
    server: { port: 0, host: '127.0.0.1', fs: { allow: [ROOT, '/tmp'] }, hmr: false },
    logLevel: 'warn',
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite did not start');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? findChromium() });
  const report: Array<{ view: string; device: string; controls: number; problems: string[] }> = [];
  let failed = 0;
  try {
    for (const d of DEVICES) {
      for (const v of VIEWS) {
        if (only && !only.includes(v.name)) continue;
        const ctx = await browser.newContext({ viewport: d.size, deviceScaleFactor: 1, isMobile: d.mobile, hasTouch: d.mobile });
        const page = await ctx.newPage();
        // tsx keeps function names with an `__name` helper the page does not have.
        await page.addInitScript('window.__name = (f) => f;');
        page.on('pageerror', (e) => process.stdout.write(`[${d.id} ${v.name}] page error: ${e.message}\n`));
        await page.goto(`${url}?${v.query}${d.mobile ? '&touch=1' : ''}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(900);
        if (v.act) {
          await v.act(page);
          await page.waitForTimeout(900);
        }
        const r = await page.evaluate(audit, d.mobile);
        // The audit scrolls each control into view: put every scroller back before the picture.
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollTop || el.scrollLeft) el.scrollTo(0, 0);
        });
        const file = path.join(outDir, `${d.id}-${v.name}.png`);
        await page.screenshot({ path: file });
        report.push({ view: v.name, device: d.id, ...r });
        if (r.problems.length) failed++;
        process.stdout.write(`${r.problems.length ? 'FAIL' : 'ok  '} ${d.id} ${v.name} (${r.controls} controls) ${file}\n${r.problems.slice(0, 8).map((p) => `      ${p}\n`).join('')}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
