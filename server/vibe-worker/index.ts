/**
 * RMHVibe — Thumbnail Worker
 *
 * Long-lived Node.js process that renders gallery screenshots for vibe pages,
 * decoupled from the web app so headless Chromium runs here (not in the web
 * container's request path). Polls for pages flagged `thumbnailStale`, renders
 * each with Playwright, saves the PNG to the shared db/ volume, and points the
 * page row at it.
 *
 * Pages are flagged stale on creation (column default) and on every customize.
 * Runs as a separate Docker service / dev process.
 */

import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { captureVibeThumbnail, closeVibeBrowser } from '@/lib/rmhvibe/vibe-screenshot.server';

const POLL_INTERVAL_MS = 10_000;
const BATCH_SIZE = 5;

let running = false;

async function processStale(): Promise<void> {
  // Guard against overlapping ticks — a batch of captures can outlast the interval.
  if (running) return;
  running = true;
  try {
    const pages = await prisma.vibePage.findMany({
      where: { thumbnailStale: true },
      select: { slug: true, html: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const page of pages) {
      const url = await captureVibeThumbnail(page.slug, page.html);
      if (!url) {
        console.error(`[vibe-worker] capture failed for ${page.slug}`);
        continue;
      }
      // Clear the flag only if the page hasn't been customized while we rendered
      // (updatedAt unchanged); otherwise leave it stale to re-render next tick.
      const cleared = await prisma.vibePage.updateMany({
        where: { slug: page.slug, updatedAt: page.updatedAt },
        data: { thumbnailUrl: url, thumbnailStale: false },
      });
      if (cleared.count > 0) {
        console.log(`[vibe-worker] rendered ${page.slug}`);
      } else {
        // Page changed mid-render; still record the URL so the gallery shows
        // something, but keep it stale so the latest content gets re-rendered.
        await prisma.vibePage.update({
          where: { slug: page.slug },
          data: { thumbnailUrl: url },
        }).catch(() => {});
        console.log(`[vibe-worker] ${page.slug} changed mid-render — will re-render`);
      }
    }
  } catch (e) {
    console.error('[vibe-worker] poll failed:', e);
  } finally {
    running = false;
  }
}

console.log('[vibe-worker] Starting…');
void processStale();
const timer = setInterval(() => void processStale(), POLL_INTERVAL_MS);

async function shutdown(signal: string) {
  console.log(`[vibe-worker] ${signal} received, shutting down…`);
  clearInterval(timer);
  await closeVibeBrowser();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
