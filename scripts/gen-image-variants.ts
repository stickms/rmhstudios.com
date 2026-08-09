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

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

/** `/images/_variants/games/altair-320.webp` */
function variantPath(srcPublicPath: string, width: number): string {
  const withoutPrefix = srcPublicPath.replace(/^\/images\//, '');
  const stem = withoutPrefix.replace(/\.[^.]+$/, '');
  return `/images/_variants/${stem}-${width}.webp`;
}

async function main() {
  if (!existsSync(PUBLIC_IMAGES)) {
    console.error(`[images] no ${PUBLIC_IMAGES} — nothing to do`);
    return;
  }

  const sources = walk(PUBLIC_IMAGES).sort();
  const manifest: Record<string, number[]> = {};
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

    const sourceMtime = statSync(absolute).mtimeMs;
    const produced: number[] = [];

    for (const width of widths) {
      const outPublic = variantPath(src, width);
      const outAbsolute = join(process.cwd(), 'public', outPublic.replace(/^\//, ''));
      mkdirSync(dirname(outAbsolute), { recursive: true });

      if (existsSync(outAbsolute) && statSync(outAbsolute).mtimeMs >= sourceMtime) {
        produced.push(width);
        skipped++;
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
      manifest[src] = produced;
      const smallest = join(
        process.cwd(),
        'public',
        variantPath(src, produced[0]).replace(/^\//, ''),
      );
      if (existsSync(smallest)) {
        savedBytes += statSync(absolute).size - statSync(smallest).size;
      }
    }
  }

  const entries = Object.keys(manifest).sort();
  const body = entries.map((k) => `  ${JSON.stringify(k)}: [${manifest[k].join(', ')}],`).join('\n');

  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(
    MANIFEST,
    `// GENERATED by scripts/gen-image-variants.ts — do not edit by hand.
// Run \`pnpm images:variants\` (or \`pnpm build\`) to regenerate.
//
// Maps a public image path to the widths that exist under
// /images/_variants/. \`OptimizedImage\` emits a srcSet only for paths listed
// here, so an image with no entry is served exactly as it was before.

export const IMAGE_VARIANTS: Readonly<Record<string, readonly number[]>> = {
${body}
};

/** The variant URL for a source path and width (see gen-image-variants.ts). */
export function variantUrl(src: string, width: number): string {
  return \`/images/_variants/\${src.replace(/^\\/images\\//, '').replace(/\\.[^.]+$/, '')}-\${width}.webp\`;
}
`,
    'utf8',
  );

  // Build scripts report to the build log; this is the only output it produces.
  // eslint-disable-next-line no-console
  console.log(
    `[images] ${entries.length} images with variants · ${written} written, ${skipped} up to date · ` +
      `smallest variant saves ~${(savedBytes / 1024 / 1024).toFixed(1)} MB vs originals`,
  );
}

await main();
