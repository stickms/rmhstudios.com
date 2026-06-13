/**
 * Backfill gallery thumbnails for vibe pages that don't have one yet.
 *
 * New pages and customizes render their thumbnail automatically; this catches
 * pages created before thumbnails existed (or any whose capture failed). Reuses
 * the same captureVibeThumbnail path (single shared Chromium, serialized), so
 * it's safe to run on prod and re-runnable anytime.
 *
 * Run: npx tsx scripts/backfill-vibe-thumbs.ts
 */

import { prisma } from '@/lib/prisma.server';
import { captureVibeThumbnail, closeVibeBrowser } from '@/lib/rmhvibe/vibe-screenshot.server';

async function main() {
  const pages = await prisma.vibePage.findMany({
    where: { thumbnailUrl: null },
    select: { slug: true, html: true },
    orderBy: { createdAt: 'desc' },
  });

  if (pages.length === 0) {
    console.log('All vibe pages already have thumbnails. Nothing to do.');
    return;
  }

  console.log(`Rendering thumbnails for ${pages.length} page(s)…`);
  let ok = 0;
  let failed = 0;

  for (const [i, page] of pages.entries()) {
    process.stdout.write(`  [${i + 1}/${pages.length}] ${page.slug} … `);
    await captureVibeThumbnail(page.slug, page.html);
    // captureVibeThumbnail is best-effort and swallows errors; confirm by
    // re-reading whether the row now has a thumbnail URL.
    const row = await prisma.vibePage.findUnique({
      where: { slug: page.slug },
      select: { thumbnailUrl: true },
    });
    if (row?.thumbnailUrl) {
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
