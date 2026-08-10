/**
 * Build-time responsive variants for `public/images/**` (OPT-24).
 *
 * ## The problem this solves
 *
 * `components/ui/OptimizedImage.tsx#buildOptimizedUrl` says it out loud:
 * "Local/static paths (e.g. /images/...) — serve as-is, no optimization
 * available". So every card on `/games` downloaded the full-resolution master
 * to paint a thumbnail. Measured 2026-08-09 on a 1280px viewport:
 *
 *   800x1193  shown at 209x117  = 3.8x oversized   house_always_wins.webp
 *   1280x720  shown at 209x117  = 6.1x oversized   nightrail.webp
 *
 * — 2,070 KB of art on `/games`, for images displayed at ~1/14th the pixels.
 *
 * ## Why a script and not `vite-imagetools`
 *
 * OPT-24 proposes `vite-imagetools`, which only works through STATIC IMPORTS
 * (`import art from '...?as=picture'`). OPT-24's own gotcha 3 is why that does
 * not fit here: every consumer references images **by string path** —
 * `lib/catalog/games/*.ts` stores `imagePath: '/images/games/altair.webp'`, and
 * that catalog is deliberately plain data because `tsx` scripts with no Vite
 * read it too (see the note at the top of `lib/catalog/index.ts`). Converting
 * 34 catalog entries to Vite-only static imports would break exactly the
 * property that file exists to protect.
 *
 * So: a plain sharp pass over the directory, keyed by the same string paths the
 * app already uses.
 *
 * ## Output
 *
 *  - `public/images/_variants/<path>-<w>.webp` — the resized files. Generated,
 *    **gitignored** (OPT-24 gotcha 2: generated variants must not be committed).
 *  - `lib/images/variants.gen.ts` — the manifest, **committed**, in the same
 *    spirit as `lib/i18n/resources.<locale>.ts`. `OptimizedImage` emits a
 *    `srcSet` only for paths listed here, so a missing variant can never 404:
 *    if the manifest doesn't know about an image, it is served as-is exactly
 *    like before.
 *
 * Idempotent: a variant whose file is newer than its source is left alone, so
 * re-runs in a warm Docker layer cost nothing.
 *
 * Run: `pnpm images:variants` (and automatically as part of `pnpm build`).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, relative } from 'node:path';
import sharp from 'sharp';

const PUBLIC_IMAGES = join(process.cwd(), 'public', 'images');
const MANIFEST = join(process.cwd(), 'lib', 'images', 'variants.gen.ts');

/** Matches `WIDTHS` in components/ui/OptimizedImage.tsx. */
const WIDTHS = [320, 640, 960, 1280] as const;

const SOURCE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/**
 * Directories that must keep exactly one size.
 *
 * `og/` and `social/` back Open Graph cards, whose declared `og:image:width` /
 * `og:image:height` are part of the meta contract (`lib/seo.ts` writes them and
 * `docs/open-graph.md` documents them) — a scaled variant would make the
 * declaration a lie. `icons/` has no responsive story.
 */
const EXCLUDED = ['_variants', 'og', 'social', 'icons', 'brand'];

/** A source small enough that a 320w variant would not save anything. */
const MIN_SOURCE_WIDTH = 400;

/**
 * `--check`: verify the committed manifest matches what a fresh run would
 * produce, without writing anything. Wired into the commit gate so adding a
 * game's art without regenerating can't silently ship the full-size master.
 */
const check = process.argv.includes('--check');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED.includes(entry.name)) continue;
      walk(join(dir, entry.name), out);
      continue;
    }
    if (SOURCE_EXT.has(extname(entry.name).toLowerCase())) out.push(join(dir, entry.name));
  }
  return out;
}

/** `/images/games/altair.webp` — the string form the app references. */
function publicPath(absolute: string): string {
  return '/images/' + relative(PUBLIC_IMAGES, absolute).split('\\').join('/');
}

/**
 * `/images/_variants/games/altair-a1b2c3d4-320.webp`
 *
 * The hash is of the SOURCE bytes, so the filename changes if and only if the
 * art changes. That is what lets these be served `immutable` for a year
 * (OPT-46) rather than the 30-day revalidating window `/images/**` gets: a
 * non-hashed name can be replaced under a cache entry, a hashed one cannot.
 * `public/images/**` masters keep their plain names — they are referenced by
 * string path from the catalog and are not safe to make immutable.
 */
function variantPath(srcPublicPath: string, hash: string, width: number): string {
  const withoutPrefix = srcPublicPath.replace(/^\/images\//, '');
  const stem = withoutPrefix.replace(/\.[^.]+$/, '');
  return `/images/_variants/${stem}-${hash}-${width}.webp`;
}

/** Short content hash of a source image. */
function hashOf(absolute: string): string {
  return createHash('sha256').update(readFileSync(absolute)).digest('hex').slice(0, 8);
}

async function main() {
  if (!existsSync(PUBLIC_IMAGES)) {
    console.error(`[images] no ${PUBLIC_IMAGES} — nothing to do`);
    return;
  }

  const sources = walk(PUBLIC_IMAGES).sort();
  const manifest: Record<string, { hash: string; widths: number[] }> = {};
  let written = 0;
  let skipped = 0;
  let savedBytes = 0;

  for (const absolute of sources) {
    const src = publicPath(absolute);
    let meta: sharp.Metadata;
    try {
      meta = await sharp(absolute).metadata();
    } catch (cause) {
      console.warn(`[images] unreadable, left as-is: ${src} (${String(cause)})`);
      continue;
    }
    const sourceWidth = meta.width ?? 0;
    if (sourceWidth < MIN_SOURCE_WIDTH) continue;

    // Only widths that are actually smaller than the source. Upscaling would
    // add bytes for no pixels.
    const widths = WIDTHS.filter((w) => w < sourceWidth);
    if (!widths.length) continue;

    const hash = hashOf(absolute);
    const produced: number[] = [];

    for (const width of widths) {
      const outPublic = variantPath(src, hash, width);
      const outAbsolute = join(process.cwd(), 'public', outPublic.replace(/^\//, ''));
      mkdirSync(dirname(outAbsolute), { recursive: true });

      // The filename carries the source hash, so an existing file is by
      // definition up to date — no mtime comparison needed.
      if (existsSync(outAbsolute)) {
        produced.push(width);
        skipped++;
        continue;
      }

      if (check) {
        // In --check mode nothing is written; a missing variant is reported by
        // the manifest comparison at the end.
        produced.push(width);
        continue;
      }

      await sharp(absolute)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toFile(outAbsolute);

      produced.push(width);
      written++;
    }

    if (produced.length) {
      manifest[src] = { hash, widths: produced };
      const smallest = join(
        process.cwd(),
        'public',
        variantPath(src, hash, produced[0]).replace(/^\//, ''),
      );
      if (existsSync(smallest)) {
        savedBytes += statSync(absolute).size - statSync(smallest).size;
      }
    }
  }

  const entries = Object.keys(manifest).sort();
  const body = entries
    .map(
      (k) =>
        `  ${JSON.stringify(k)}: { hash: '${manifest[k].hash}', widths: [${manifest[k].widths.join(', ')}] },`,
    )
    .join('\n');

  const contents = `// GENERATED by scripts/gen-image-variants.ts — do not edit by hand.
// Run \`pnpm images:variants\` (or \`pnpm build\`) to regenerate;
// \`pnpm images:variants:check\` fails when this file is out of date.
//
// Maps a public image path to the content hash of its master and the widths
// generated under /images/_variants/. Callers emit a srcSet only for paths
// listed here, so an image with no entry is served exactly as it was before —
// which is why adding art without regenerating this file silently costs the
// optimization rather than breaking the page, and why the commit gate checks it.

export type ImageVariant = { readonly hash: string; readonly widths: readonly number[] };

export const IMAGE_VARIANTS: Readonly<Record<string, ImageVariant>> = {
${body}
};

/**
 * The variant URL for a source path and width. Returns null when the image has
 * no generated variants, so callers fall back to the original src.
 */
export function variantUrl(src: string, width: number): string | null {
  const entry = IMAGE_VARIANTS[src];
  if (!entry) return null;
  const stem = src.replace(/^\\/images\\//, '').replace(/\\.[^.]+$/, '');
  return \`/images/_variants/\${stem}-\${entry.hash}-\${width}.webp\`;
}
`;

  if (check) {
    const current = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : '';
    if (current !== contents) {
      console.error(
        '[images] lib/images/variants.gen.ts is out of date.\n' +
          '         An image under public/images/** was added, changed or removed without\n' +
          '         regenerating the manifest, so it will silently ship at full size.\n' +
          '         Fix: pnpm images:variants',
      );
      process.exitCode = 1;
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[images] manifest up to date (${entries.length} images)`);
    return;
  }

  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, contents, 'utf8');

  // Build scripts report to the build log; this is the only output it produces.
  // eslint-disable-next-line no-console
  console.log(
    `[images] ${entries.length} images with variants · ${written} written, ${skipped} up to date · ` +
      `smallest variant saves ~${(savedBytes / 1024 / 1024).toFixed(1)} MB vs originals`,
  );
}

await main();
