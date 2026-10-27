#!/usr/bin/env node
/**
 * audit-pages: the real-browser half of the design guards.
 *
 *   pnpm audit:pages                      every static _site route, phone width, Midnight, iPhone Safari UA
 *   pnpm audit:pages --routes /games,/create
 *   pnpm audit:pages --full               also desktop width and Daylight
 *   pnpm audit:pages --first-visit        audit as a new visitor (cookie banner showing)
 *   pnpm audit:pages --strict             exit 1 on any finding not in docs/page-audit-allowlist.json
 *   pnpm audit:pages --base-url http://127.0.0.1:7005
 *   pnpm audit:pages --chromium /path/to/chrome     (when Playwright's own browser is not installed)
 *
 * Needs a running app (`pnpm dev`). Chromium only; the iPhone user-agent makes the pre-paint script stamp
 * `html.ios-webkit`, so the page renders the way it does on Safari.
 *
 * Two checks per page load (docs/superpowers/specs/2026-10-27-edge-and-consistency-guards-design.md):
 *
 *  EDGES    Every visible `position: fixed` element touching the top or bottom edge, and every sticky element pinned to
 *           one. These are what iOS 26 Safari fills its status-bar and tab-bar strips from, so each one is a coloured
 *           band waiting to happen (app/globals.css "iOS 26 Safari tints the strips…"). Chromium cannot reproduce the
 *           tint, so this checks the CAUSE, which is what the site's own contract names.
 *  ANATOMY  The shared page frame: a PageLayout heading, and the heading, tab strip and search field starting and ending
 *           on the same edges. A page that hand-rolls its own wrapper and drifts (e.g. /create vs /games) shows up here.
 *
 * Findings in the allowlist are reviewed and one-directional: entries come out as pages are fixed, they do not go in
 * without the owner's review. A stale entry (a finding that no longer occurs) is reported so it can be deleted.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
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
const FULL = flag('full');
const FIRST_VISIT = flag('first-visit');
const OUT = opt('out', '');
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const ALLOW_PATH = join(ROOT, 'docs/page-audit-allowlist.json');
const allow = existsSync(ALLOW_PATH)
  ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8'))
  : { edges: {}, near: {}, anatomy: {} };

/** Static `_site` paths from the generated route tree (no params, no API, no admin). */
function routesFromTree() {
  const s = readFileSync(join(ROOT, 'app/routeTree.gen.ts'), 'utf8');
  const paths = new Set();
  for (const m of s.matchAll(/'(\/_site\/[^']*)': \{[^}]*?fullPath: '([^']*)'/g)) {
    const fp = m[2];
    if (fp.includes('$') || fp.startsWith('/api') || fp.startsWith('/admin')) continue;
    paths.add(fp.replace(/\/\$/, '') || '/');
  }
  return [...paths];
}

const routes = opt('routes', '') ? opt('routes', '').split(',') : routesFromTree();
const passes = FULL
  ? [
      { width: 390, height: 844, theme: 'graphite', ios: true },
      { width: 390, height: 844, theme: 'default', ios: true },
      { width: 1280, height: 800, theme: 'graphite', ios: false },
    ]
  : [{ width: 390, height: 844, theme: 'graphite', ios: true }];

/** Runs in the page. Returns { ios, edges: string[], anatomy: {…} }. */
function inPage() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const describe = (e) =>
    e.tagName.toLowerCase() +
    (e.id ? `#${e.id}` : '') +
    (typeof e.className === 'string' && e.className
      ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '');
  const edges = [];
  const near = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.02)
      continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const wide = r.width >= W * 0.4;
    const tall = r.height >= H * 0.4;
    const touches = r.top <= 3 || r.bottom >= H - 3;
    const pinned =
      cs.position === 'sticky' &&
      ((cs.top !== 'auto' && parseFloat(cs.top) <= 3) ||
        (cs.bottom !== 'auto' && parseFloat(cs.bottom) <= 3));
    if (cs.position === 'fixed' && touches && (wide || tall)) edges.push(`FIXED ${describe(e)}`);
    else if (pinned && wide) edges.push(`STICKY ${describe(e)}`);
    // Painted and close to a bar (Safari's floating bars cover roughly the outer 100px): not proof of a band, but the
    // thing to look at when one appears. Reported separately so a NEW one is noticed.
    else if (
      cs.position === 'fixed' &&
      (r.top <= 100 || H - r.bottom <= 120) &&
      r.width >= 40 &&
      r.top > -5 &&
      (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none')
    )
      near.push(`NEAR ${describe(e)}`);
  }
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
  };
  const heading = q('.page-heading');
  // Page-level controls only: a tab strip or search inside a card, pane, overlay or dialog is a local control with its
  // own layout, not part of the page frame. A `glass-chrome` header is page-level, so a custom title+search bar counts.
  const pageLevel = (el) =>
    !el.closest('.glass-fill, .glass-pane, .glass-overlay, [role=dialog], dialog');
  const first = (sel) =>
    [...document.querySelectorAll(sel)].find(
      (el) => pageLevel(el) && el.getBoundingClientRect().width > 0,
    ) || null;
  const tabs = first("[data-slot='liquid-tabs-sheet']");
  const search = first("[data-slot='search-field']");
  const card = q('.glass-fill');
  return {
    ios: document.documentElement.classList.contains('ios-webkit'),
    edges,
    near,
    anatomy: {
      heading: heading ? box(heading.querySelector('h1, h2') || heading) : null,
      tabs: box(tabs),
      search: box(search),
      tabAppearance: q("[data-slot='liquid-tabs']")?.getAttribute('data-tab-appearance') ?? null,
      cardRadius: card ? getComputedStyle(card).borderTopLeftRadius : null,
    },
  };
}

/** Anatomy deviations from the shared frame. Edges the page ASKS for: heading, tab strip, search. */
function anatomyFindings(a, width) {
  const out = [];
  const tol = 2;
  if (width <= 480) {
    const lefts = [
      ['heading', a.heading?.l],
      ['tabs', a.tabs?.l],
      ['search', a.search?.l],
    ].filter(([, v]) => v != null);
    if (lefts.length >= 2) {
      const min = Math.min(...lefts.map(([, v]) => v));
      const max = Math.max(...lefts.map(([, v]) => v));
      if (max - min > tol + 16)
        out.push(`left edges differ: ${lefts.map(([k, v]) => `${k}=${v}`).join(' ')}`);
    }
    if (
      a.tabs &&
      a.search &&
      (Math.abs(a.tabs.l - a.search.l) > tol || Math.abs(a.tabs.r - a.search.r) > tol)
    ) {
      out.push(
        `tab strip (${a.tabs.l}-${a.tabs.r}) and search (${a.search.l}-${a.search.r}) are not the same width`,
      );
    }
  }
  return out;
}

const findings = { edges: {}, near: {}, anatomy: {} };
const errors = [];
// `--chromium /path/to/chrome` (or PW_CHROMIUM) when the installed Playwright's own browser build is not available.
const executablePath = opt('chromium', process.env.PW_CHROMIUM || '') || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
for (const pass of passes) {
  const ctx = await browser.newContext({
    viewport: { width: pass.width, height: pass.height },
    ...(pass.ios ? { userAgent: UA, hasTouch: true, isMobile: true } : {}),
  });
  await ctx.addInitScript(
    ([theme, consented]) => {
      try {
        window.localStorage.setItem('rmh-style', theme);
        // A returning visitor: the consent banner is a transient fixed panel near the bottom of every page for a first
        // visit, and would drown the report. `--first-visit` audits it instead.
        if (consented) window.localStorage.setItem('rmh-cookie-consent', 'essential');
      } catch {
        /* private mode */
      }
    },
    [pass.theme, !FIRST_VISIT],
  );
  for (const path of routes) {
    const label = `${path} @${pass.width}/${pass.theme}`;
    // A fresh page per route: one heavy page crashing (Chromium does) must not take the rest of the run with it.
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2500);
      const r = await page.evaluate(inPage);
      if (pass.ios && !r.ios)
        errors.push(`${label}: html.ios-webkit was not stamped (user agent not recognised)`);
      for (const e of pass.ios ? r.edges : []) (findings.edges[path] ??= []).push(e);
      for (const e of pass.ios ? r.near : []) (findings.near[path] ??= []).push(e);
      for (const a of anatomyFindings(r.anatomy, pass.width)) {
        (findings.anatomy[`${path} @${pass.width}`] ??= []).push(a);
      }
    } catch (e) {
      errors.push(`${label}: ${String(e).slice(0, 100)}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  await ctx.close();
}
await browser.close();

const isAllowed = (kind, path, text) => (allow[kind]?.[path] ?? []).includes(text);
let bad = 0;
const report = [];
const TITLES = {
  edges: 'iOS EDGE-PINNED LAYERS (coloured-band risk)',
  near: 'PAINTED FIXED LAYERS NEAR A BAR (look here when a band appears)',
  anatomy: 'PAGE ANATOMY DEVIATIONS',
};
for (const kind of ['edges', 'near', 'anatomy']) {
  const title = TITLES[kind];
  const lines = [];
  for (const [path, list] of Object.entries(findings[kind])) {
    for (const text of [...new Set(list)]) {
      const ok = isAllowed(kind, path, text);
      if (!ok) bad++;
      lines.push(`  ${ok ? 'allowed' : 'NEW    '}  ${path}  ${text}`);
    }
  }
  report.push(`\n${title}: ${lines.length ? '' : 'none'}`, ...lines);
}
// Stale allowlist entries: reviewed findings that no longer occur (only meaningful for the routes that were audited).
const audited = new Set(routes);
const stale = [];
for (const kind of ['edges', 'near', 'anatomy']) {
  for (const [path, list] of Object.entries(allow[kind] ?? {})) {
    if (!audited.has(path.split(' @')[0])) continue;
    for (const text of list)
      if (!findings[kind][path]?.includes(text)) stale.push(`${kind} ${path} :: ${text}`);
  }
}
if (stale.length)
  report.push('\nSTALE ALLOWLIST ENTRIES (delete them):', ...stale.map((s) => `  ${s}`));
if (errors.length) report.push('\nERRORS:', ...errors.map((s) => `  ${s}`));
console.log(report.join('\n'));
console.log(
  `\n${routes.length} route(s), ${passes.length} pass(es): ${bad} finding(s) not in the allowlist.`,
);
if (OUT) writeFileSync(OUT, JSON.stringify({ findings, errors, stale }, null, 2));
if (STRICT && (bad > 0 || stale.length > 0 || errors.length > 0)) process.exit(1);
