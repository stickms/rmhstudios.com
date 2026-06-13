/**
 * RMHVibe — headless thumbnail rendering.
 *
 * Generated vibe pages are arbitrary interactive HTML (esbuild-bundled React,
 * canvas, three.js from esm.sh) that the client renders in a locked-down iframe.
 * To show them in the gallery we render the saved HTML once, server-side, in a
 * headless Chromium, screenshot it, downscale with sharp, and save a PNG to disk.
 *
 * This module is imported ONLY by the vibe-worker (and the backfill script) — never
 * by the web app — so Playwright/Chromium stay out of the web bundle and image's
 * hot path. It renders and returns the public URL; persisting it to the DB (and
 * clearing the `thumbnailStale` flag) is the caller's job.
 */

import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import type { Browser } from 'playwright';
import sharp from 'sharp';
import { THUMB_DIR } from '@/lib/rmhvibe/vibe-thumbs';

// Card capture viewport — 16:10 reads well in the grid. The saved PNG is
// downscaled from this so the served thumbnail stays small.
const VIEWPORT = { width: 1200, height: 750 };
const THUMB_WIDTH = 640;

// Only these origins are reachable while rendering a page (defense-in-depth on
// top of the page's own injected CSP). Everything else is aborted, which also
// speeds up captures by dropping stray requests.
const ALLOWED_HOSTS = new Set(['esm.sh', 'cdn.jsdelivr.net']);

// A single shared browser, launched lazily and reused across captures.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      // Imported dynamically + externalized from the build: Playwright has
      // dynamic requires that can't be bundled, and this keeps a launch failure
      // (e.g. Chromium missing) from crashing the module at load.
      const { chromium } = await import('playwright');
      return chromium.launch({
        headless: true,
        // Container-safe flags; sandbox can't run as the unprivileged app user.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        // In prod we use the OS Chromium (Alpine musl) via this env var; locally
        // it's unset and Playwright uses its own downloaded browser.
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      });
    })().catch((err) => {
      // Reset so a later capture can retry the launch.
      browserPromise = null;
      throw err;
    });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

/** Close the shared browser so a worker/script process can exit cleanly. */
export async function closeVibeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const p = browserPromise;
  browserPromise = null;
  try {
    const browser = await p;
    await browser.close();
  } catch {
    /* already gone */
  }
}

/**
 * Render `html` headlessly and save a downscaled PNG thumbnail for `slug`.
 * Returns the public, cache-busted URL on success, or `null` on any failure
 * (caller leaves the thumbnail unset → gallery shows a placeholder).
 */
export async function captureVibeThumbnail(slug: string, html: string): Promise<string | null> {
  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      javaScriptEnabled: true,
      bypassCSP: false,
    });

    // Block any origin we don't explicitly allow.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      try {
        const { hostname, protocol } = new URL(url);
        if (protocol === 'https:' && ALLOWED_HOSTS.has(hostname)) return route.continue();
      } catch {
        /* malformed URL — fall through to abort */
      }
      return route.abort();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10_000);

    try {
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 10_000 });
    } catch {
      // networkidle can time out on animation-heavy pages; screenshot anyway.
    }

    // Let esm.sh modules load + first React paint + intro animations settle.
    await page.waitForTimeout(1500);

    const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...VIEWPORT } });
    const thumb = await sharp(raw)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await mkdir(THUMB_DIR, { recursive: true });
    await writeFile(path.join(THUMB_DIR, `${slug}.png`), thumb);

    return `/api/vibe/thumb/${slug}?v=${Date.now()}`;
  } catch {
    return null;
  } finally {
    await context?.close().catch(() => {});
  }
}
