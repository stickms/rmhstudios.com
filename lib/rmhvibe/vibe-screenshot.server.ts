/**
 * RMHVibe — server-side thumbnail capture.
 *
 * Generated vibe pages are arbitrary interactive HTML (React-via-Babel, canvas,
 * three.js from esm.sh) that the client renders in a locked-down sandboxed iframe.
 * To show them in the gallery we render the saved HTML once, server-side, in a
 * headless Chromium, screenshot it, downscale with sharp, and save a PNG to disk.
 * The page row's `thumbnailUrl` is then set so the gallery can serve the image.
 *
 * Server-only (`.server.ts`) — uses Playwright, the filesystem, and Prisma.
 * Chromium runs only here; nothing browser-related ships to the client bundle.
 */

import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { chromium, type Browser } from 'playwright';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma.server';

// Card capture viewport — 16:10 reads well in the grid. The saved PNG is
// downscaled from this so the served thumbnail stays small.
const VIEWPORT = { width: 1200, height: 750 };
const THUMB_WIDTH = 640;

// Where rendered thumbnails live on disk (mirrors db/avatars). Served by
// app/routes/api/vibe/thumb/$slug.ts.
export const THUMB_DIR = path.join(process.cwd(), 'db', 'vibe-thumbs');

// Only these origins are reachable while rendering a page (defense-in-depth on
// top of the page's own injected CSP). Everything else is aborted, which also
// speeds up captures by dropping stray requests.
const ALLOWED_HOSTS = new Set(['esm.sh', 'cdn.jsdelivr.net']);

// A single shared browser, launched lazily and reused across captures.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
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

// Serialize captures so a burst of generations can't spawn many Chromium tabs
// at once (each capture is heavy and runs untrusted page JS).
let captureChain: Promise<void> = Promise.resolve();

/**
 * Render `html` headlessly and persist a downscaled PNG thumbnail for `slug`,
 * then point the page row's `thumbnailUrl` at it. Best-effort: on any failure
 * the thumbnail is simply left unset (the gallery shows a placeholder). Safe to
 * call fire-and-forget.
 */
export function captureVibeThumbnail(slug: string, html: string): Promise<void> {
  captureChain = captureChain.then(() => runCapture(slug, html)).catch(() => {});
  return captureChain;
}

/** Close the shared browser (for one-off scripts so the process can exit). */
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

async function runCapture(slug: string, html: string): Promise<void> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    javaScriptEnabled: true,
    bypassCSP: false,
  });

  try {
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

    // Let Babel transform + first React paint + intro animations settle.
    await page.waitForTimeout(1500);

    const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...VIEWPORT } });
    const thumb = await sharp(raw)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await mkdir(THUMB_DIR, { recursive: true });
    await writeFile(path.join(THUMB_DIR, `${slug}.png`), thumb);

    await prisma.vibePage.update({
      where: { slug },
      data: { thumbnailUrl: `/api/vibe/thumb/${slug}?v=${Date.now()}` },
    });
  } finally {
    await context.close().catch(() => {});
  }
}
