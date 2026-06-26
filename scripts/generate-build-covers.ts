/**
 * Generate wide, custom-aspect-ratio promotional covers for curated builds
 * (games + apps) with xAI, store them on the CDN as WebP, and record the public
 * URLs in data/build-covers.json (which the storefront reads).
 *
 * Idempotent by design — it will NOT regenerate a cover that already exists in
 * object storage (or is already in the manifest) unless you pass --force. So a
 * routine run is cheap/no-op; only new builds or new ratios cost an image.
 *
 *   Run once per build (default 'wide' ratio):
 *     XAI_API_KEY=... VITE_CDN_BASE_URL=https://cdn.rmhstudios.com \
 *       pnpm exec tsx scripts/generate-build-covers.ts
 *
 *   Add more aspect ratios:        --ratios=wide,ultrawide
 *   Force-regenerate (big change): --force
 *   Limit to specific builds:      --ids=rmhbox,altair
 *
 * Requires XAI_API_KEY (+ optional XAI_IMAGE_MODEL) and a configured CDN/R2.
 * Re-runnable and safe on prod.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { generateBuildCover, isBuildCoverConfigured } from '@/lib/builds/cover.server';
import { BUILD_COVER_RATIOS, type BuildCoverRatio } from '@/lib/builds/cover-manifest';
import { s3Configured } from '@/lib/storage/s3.server';
import { CDN_BASE } from '@/lib/storage/asset';

const MANIFEST_PATH = path.resolve(fileURLToPath(import.meta.url), '../../data/build-covers.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const force = args.includes('--force');
  const ratiosArg = get('ratios');
  const ratios = (ratiosArg ? ratiosArg.split(',') : ['wide'])
    .map((r) => r.trim())
    .filter((r): r is BuildCoverRatio => (BUILD_COVER_RATIOS as readonly string[]).includes(r));
  const idsArg = get('ids');
  const ids = idsArg ? new Set(idsArg.split(',').map((s) => s.trim())) : null;
  return { force, ratios: ratios.length ? ratios : (['wide'] as BuildCoverRatio[]), ids };
}

function loadManifest(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function main() {
  if (!isBuildCoverConfigured()) {
    console.error('XAI_API_KEY is not set (or XAI_IMAGE_ENABLED=false). Nothing to do.');
    process.exitCode = 1;
    return;
  }
  if (!s3Configured()) {
    console.error('Object storage (S3_*) is not configured — nowhere to store covers. Aborting.');
    process.exitCode = 1;
    return;
  }
  if (!CDN_BASE) {
    console.warn('VITE_CDN_BASE_URL is not set — covers will be served via the /api/builds/cover proxy.');
  }

  const { force, ratios, ids } = parseArgs();
  const builds = listCuratedBuilds().filter((b) => !ids || ids.has(b.id));
  const manifest = loadManifest();

  console.log(`Generating covers for ${builds.length} build(s), ratios: ${ratios.join(', ')}${force ? ' (force)' : ''}\n`);

  let made = 0;
  let skipped = 0;
  let failed = 0;

  for (const build of builds) {
    for (const ratio of ratios) {
      const manifestKey = `${build.id}:${ratio}`;
      if (!force && manifest[manifestKey]) {
        skipped++;
        continue;
      }
      process.stdout.write(`  ${build.id} [${ratio}] … `);
      const url = await generateBuildCover({
        build: { id: build.id, title: build.title, description: build.longDescription || build.description, tags: build.tags },
        ratio,
        force,
      });
      if (url) {
        manifest[manifestKey] = url;
        made++;
        console.log('ok');
        // Persist after every success so a mid-run failure still saves progress.
        writeFileSync(MANIFEST_PATH, JSON.stringify(sortKeys(manifest), null, 2) + '\n');
      } else {
        failed++;
        console.log('FAILED');
      }
    }
  }

  console.log(`\nDone: ${made} generated, ${skipped} already present, ${failed} failed.`);
  console.log(`Manifest written to ${MANIFEST_PATH}. Commit it to ship the covers.`);
}

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
