/**
 * Backfill / re-render gallery thumbnails for vibe pages.
 *
 * Normally the vibe-worker (Go) handles this — it polls for pages flagged
 * `thumbnailStale` and renders them. This script is a manual fallback that
 * renders inline (Node Playwright): useful locally, when the worker is down, or
 * to recover after thumbnails were lost from object storage (the gallery shows
 * 404s / placeholders even though the DB still has a thumbnailUrl).
 *
 *   Only pages missing a thumbnail (default):  pnpm backfill-vibe-thumbs
 *   Re-render EVERY ready page — e.g. the
 *   stored objects were purged so their URLs
 *   now 404:                                   pnpm backfill-vibe-thumbs --all
 *   Cap how many to do this run:               pnpm backfill-vibe-thumbs --all --limit=50
 *
 * Safe to run on prod and re-runnable anytime.
 */

import { prisma } from '@/lib/prisma.server';
import { captureVibeThumbnail, closeVibeBrowser } from '@/lib/rmhvibe/vibe-screenshot.server';

function parseArgs() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limit = limitArg ? Math.max(1, parseInt(limitArg, 10) || 0) : undefined;
  return { all, limit };
}

async function main() {
  const { all, limit } = parseArgs();

  // Only "ready" pages have real HTML to screenshot. Default targets pages with
  // no thumbnail; `--all` re-renders every ready page (recovers lost objects).
  const where = all
    ? { status: 'ready' as const }
    : { status: 'ready' as const, thumbnailUrl: null };

  const pages = await prisma.vibePage.findMany({
    where,
    select: { slug: true, html: true },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
  });

  if (pages.length === 0) {
    console.log(
      all
        ? 'No ready vibe pages found. Nothing to do.'
        : 'All vibe pages already have thumbnails. Nothing to do (use --all to force a re-render).',
    );
    return;
  }

  console.log(`${all ? 'Re-rendering' : 'Rendering'} thumbnails for ${pages.length} page(s)…`);
  let ok = 0;
  let failed = 0;

  for (const [i, page] of pages.entries()) {
    process.stdout.write(`  [${i + 1}/${pages.length}] ${page.slug} … `);
    const url = await captureVibeThumbnail(page.slug, page.html);
    if (url) {
      await prisma.vibePage.update({
        where: { slug: page.slug },
        data: { thumbnailUrl: url, thumbnailStale: false },
      });
      ok++;
      console.log('done');
    } else {
      failed++;
      console.log('FAILED (left without a thumbnail)');
    }
  }

  console.log(`\nFinished: ${ok} rendered, ${failed} failed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeVibeBrowser();
    await prisma.$disconnect();
  });
