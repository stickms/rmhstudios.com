#!/usr/bin/env node
/**
 * audit-jelly-clip: the real-browser half of the "a bulge is never clipped" guarantee
 * (docs/superpowers/specs/2026-11-03-globe-jelly-overhaul-design.md, "Clipping").
 *
 *   pnpm audit:jelly-clip                         every static _site route, desktop + phone
 *   pnpm audit:jelly-clip --routes /,/explore     only these
 *   pnpm audit:jelly-clip --strict                exit 1 on any finding
 *   pnpm audit:jelly-clip --base-url http://127.0.0.1:7005
 *   pnpm audit:jelly-clip --chromium /path/to/chrome
 *
 * Needs a running app (`pnpm dev`). For every surface the glass engine has admitted it measures the free room between
 * the host and each clipping ancestor (any non-`visible` overflow, or paint containment) and the viewport's side edges.
 *
 *  TIGHT   (only surfaces whose canvas overdraws their host) A side with less than TIGHT_PX of room: the runtime room-cap (lib/jelly/room.ts) keeps the bulge from being
 *          cut off by flattening that side, so nothing is ever clipped, but the body cannot bulge there. These are the
 *          layouts to give their 16px (`--jelly-margin`) of room: padding on the clipping container, or move the clip to an
 *          inner wrapper.
 *  HSCROLL A page whose document scrolls sideways: a canvas overdrawing past the viewport edge.
 *
 * The site treats software WebGL as a low tier and draws no shader material there; the audit spoofs the GPU renderer
 * string so the engine runs in headless Chromium. Chromium only.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = opt('base-url', 'http://127.0.0.1:7005');
const STRICT = flag('strict');
const TIGHT_PX = 8;
const MARGIN = 16;
const SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];

/** Static `_site` paths from the generated route tree (no params, no API, no admin). */
function routesFromTree() {
  const s = readFileSync(join(ROOT, 'app/routeTree.gen.ts'), 'utf8');
  const paths = new Set(['/']);
  for (const m of s.matchAll(/'(\/_site\/[^']*)': \{[^}]*?fullPath: '([^']*)'/g)) {
    const fp = m[2];
    if (fp.includes('$') || fp.startsWith('/api') || fp.startsWith('/admin')) continue;
    paths.add(fp || '/');
  }
  return [...paths];
}
const routes = opt('routes', '') ? opt('routes', '').split(',') : routesFromTree();

const executablePath = opt('chromium', process.env.PW_CHROMIUM || '') || undefined;
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/** In the page: room per side for every admitted host, against clipping ancestors and the viewport's side edges. */
function measure({ margin, tight }) {
  const vw = document.documentElement.clientWidth;
  const clips = (el) => {
    const out = [];
    for (let q = el.parentElement; q && q !== document.documentElement; q = q.parentElement) {
      const s = getComputedStyle(q);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || /paint|strict|content/.test(s.contain)) out.push(q);
    }
    return out;
  };
  const hosts = [...document.querySelectorAll('[data-liquid-layer]')].filter((e) =>
    e.querySelector(':scope > canvas.liquid-glass-canvas'),
  );
  const tightHosts = [];
  for (const h of hosts) {
    const hr = h.getBoundingClientRect();
    if (hr.width < 1 || hr.height < 1) continue;
    // Only a canvas that overdraws its host can be cut off: chrome and overlays draw inside the box (margin 0), which
    // is how the full-bleed top bar stays flush.
    const cr = h.querySelector(':scope > canvas.liquid-glass-canvas').getBoundingClientRect();
    if ((cr.width - hr.width) / 2 < 0.5) continue;
    const room = { top: margin, right: margin, bottom: margin, left: margin };
    for (const c of clips(h)) {
      const r = c.getBoundingClientRect();
      const L = r.left + c.clientLeft;
      const T = r.top + c.clientTop;
      room.top = Math.min(room.top, hr.top - T);
      room.left = Math.min(room.left, hr.left - L);
      room.bottom = Math.min(room.bottom, T + c.clientHeight - hr.bottom);
      room.right = Math.min(room.right, L + c.clientWidth - hr.right);
    }
    room.left = Math.min(room.left, hr.left);
    room.right = Math.min(room.right, vw - hr.right);
    const worst = Math.min(room.top, room.right, room.bottom, room.left);
    if (worst < tight) {
      const sides = Object.entries(room)
        .filter(([, v]) => v < tight)
        .map(([k, v]) => `${k} ${Math.max(0, Math.round(v))}px`)
        .join(', ');
      tightHosts.push(
        `<${h.tagName.toLowerCase()} class="${String(h.className).split(/\s+/).slice(0, 4).join(' ')}"> ${sides}`,
      );
    }
  }
  return { hosts: hosts.length, tight: tightHosts, hscroll: document.documentElement.scrollWidth > vw + 1 };
}

let findings = 0;
for (const size of SIZES) {
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    await ctx.addInitScript(() => {
      for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        const get = C.prototype.getParameter;
        C.prototype.getParameter = function (p) {
          if (p === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)';
          if (p === 37445) return 'Google Inc. (NVIDIA)';
          return get.call(this, p);
        };
      }
    });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForTimeout(3500);
      for (let y = 0; y < 4000; y += 500) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(200);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1200);
      const r = await page.evaluate(measure, { margin: MARGIN, tight: TIGHT_PX });
      const bad = r.tight.length + (r.hscroll ? 1 : 0);
      findings += bad;
      console.log(`${bad ? '✗' : '✓'} ${size.name.padEnd(7)} ${route.padEnd(28)} ${r.hosts} surfaces`);
      for (const t of r.tight) console.log(`    TIGHT   ${t}`);
      if (r.hscroll) console.log('    HSCROLL the document scrolls sideways');
    } catch (e) {
      console.log(`? ${size.name.padEnd(7)} ${route.padEnd(28)} ${String(e).slice(0, 100)}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${findings} finding(s).`);
if (STRICT && findings) process.exit(1);
