// ─────────────────────────────────────────────────────────────────────────────
// Browser smoke + structural a11y/SEO checks for public, auth-free routes.
//
// Drives the built app (node .output/server/index.mjs) with a real Chromium via
// the already-installed `playwright` package — no extra dependencies. For each
// route it asserts the page renders without crashing and carries the universal
// invariants this codebase guarantees (a <title>, an <html lang>). Deeper,
// route-shape-specific a11y is intentionally reported as a warning here (route
// chrome differs on purpose — legal pages and games are full-screen, _site pages
// get the sidebar shell) and enforced more strictly by the Lighthouse job.
//
//   BASE_URL=http://localhost:3000 node testing/e2e/smoke.mjs
//
// Exit code is non-zero if any hard invariant fails.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// Public routes that must render for a signed-out visitor. Mix of the _site
// shell (feed index) and intentionally full-screen top-level pages (legal).
const ROUTES = ['/', '/login', '/privacy', '/terms', '/security', '/copyright'];

// Client-side noise that is expected in CI (no realtime hubs, no analytics) and
// must not be treated as a page failure.
const BENIGN_ERROR =
  /socket|websocket|ws:\/\/|Failed to fetch|NetworkError|ERR_|ResizeObserver|favicon|Failed to load resource/i;

const failures = [];
const warnings = [];

const fail = (route, message) => failures.push(`[${route}] ${message}`);
const warn = (route, message) => warnings.push(`[${route}] ${message}`);

async function checkRoute(browser, route) {
  const url = `${BASE_URL}${route}`;
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('pageerror', (error) => {
    if (BENIGN_ERROR.test(error.message)) warn(route, `page error (ignored): ${error.message}`);
    else fail(route, `uncaught error: ${error.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') warn(route, `console error: ${msg.text()}`);
  });

  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (error) {
    fail(route, `navigation failed: ${error.message}`);
    await context.close();
    return;
  }

  const status = response?.status() ?? 0;
  if (status < 200 || status >= 400) fail(route, `HTTP ${status}`);

  const audit = await page.evaluate(() => ({
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    mainCount: document.querySelectorAll('main').length,
    hasSkipLink: Boolean(document.querySelector('.skip-link, a[href="#main-content"]')),
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
    imagesMissingAlt: Array.from(document.querySelectorAll('img')).filter(
      (img) => !img.hasAttribute('alt'),
    ).length,
  }));

  // Hard invariants — true for every working page regardless of its chrome.
  if (!audit.lang) fail(route, 'missing <html lang>');
  if (!audit.title) fail(route, 'missing <title>');

  // Soft signals — reported, not gated (Lighthouse enforces the a11y/SEO score).
  if (audit.mainCount > 1) warn(route, `${audit.mainCount} <main> landmarks (expected 0 or 1)`);
  if (!audit.description) warn(route, 'missing meta description');
  if (!audit.canonical) warn(route, 'missing canonical link');
  if (audit.imagesMissingAlt > 0) warn(route, `${audit.imagesMissingAlt} <img> without alt`);

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const route of ROUTES) {
      await checkRoute(browser, route);
    }
  } finally {
    await browser.close();
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s):`);
    for (const line of warnings) console.log(`  - ${line}`);
  }

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failure(s):`);
    for (const line of failures) console.error(`  - ${line}`);
    process.exit(1);
  }

  console.log(`\n✅ All ${ROUTES.length} route(s) passed smoke + structural checks.`);
}

main().catch((error) => {
  console.error('smoke runner crashed:', error);
  process.exit(1);
});
