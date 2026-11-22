/**
 * The build-time image variant manifest, as a contract.
 *
 * `lib/images/variants.gen.ts` is generated, committed, and read by
 * `components/ui/OptimizedImage.tsx` to build a `srcSet` — while the files it
 * names are **gitignored** and written by `pnpm images:variants` during the
 * build. That split is deliberate (binaries don't belong in git) and it has one
 * sharp edge: the manifest can be right about files that are not there, and the
 * only symptom is a 404 per image on a page nobody looked at.
 *
 * `OptimizedImage` degrades to the untouched master on the first error, so the
 * failure is invisible rather than broken — which is exactly why it needs a test
 * rather than a reviewer.
 *
 * The AVIF half (added 2026-08-11) makes this stricter: every width now exists in
 * **two** formats, and `<source type="image/avif">` is offered ahead of the
 * `<img srcSet>`. A width present as WebP but missing as AVIF would have the
 * browser pick the AVIF source, fail, and fall back — a wasted round trip on
 * every image on the page.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGE_VARIANTS, variantUrl } from '@/lib/images/variants.gen';

/** `/images/_variants/x-hash-320.webp` → the absolute path on disk. */
const onDisk = (publicPath: string) => join(process.cwd(), 'public', publicPath.replace(/^\//, ''));

const entries = Object.entries(IMAGE_VARIANTS);

describe('image variant manifest', () => {
  it('is not empty (a generator that silently produced nothing is the failure mode)', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every entry has at least one width, ascending and unique', () => {
    for (const [src, entry] of entries) {
      expect(entry.widths.length, src).toBeGreaterThan(0);
      const sorted = [...entry.widths].sort((a, b) => a - b);
      expect(entry.widths, src).toEqual(sorted);
      expect(new Set(entry.widths).size, src).toBe(entry.widths.length);
    }
  });

  it('every entry has an 8-char content hash', () => {
    for (const [src, entry] of entries) {
      expect(entry.hash, src).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('variantUrl returns null for an unlisted path, so callers fall back to the master', () => {
    expect(variantUrl('/images/definitely-not-generated.png', 320)).toBeNull();
  });

  it('variantUrl defaults to webp and honours an explicit format', () => {
    const [src, entry] = entries[0];
    const width = entry.widths[0];
    expect(variantUrl(src, width)).toMatch(/\.webp$/);
    expect(variantUrl(src, width, 'webp')).toMatch(/\.webp$/);
    expect(variantUrl(src, width, 'avif')).toMatch(/\.avif$/);
    // Same stem, same hash, same width — only the extension differs, which is
    // what lets one `widths` array describe both `<source>` sets.
    expect(variantUrl(src, width, 'avif')!.replace(/\.avif$/, '')).toBe(
      variantUrl(src, width, 'webp')!.replace(/\.webp$/, ''),
    );
  });

  // Skipped rather than failed when the variants have not been generated in this
  // working tree: `pnpm test` must pass on a fresh clone that has never run
  // `pnpm images:variants`. In CI and in the Docker build the generator runs as
  // part of `pnpm build`, so there the assertion is live.
  const [firstSrc, firstEntry] = entries[0] ?? [];
  const generated = firstSrc ? existsSync(onDisk(variantUrl(firstSrc, firstEntry.widths[0])!)) : false;

  it.runIf(generated)('every manifest width exists on disk in BOTH avif and webp', () => {
    const missing: string[] = [];
    for (const [src, entry] of entries) {
      for (const width of entry.widths) {
        for (const format of ['avif', 'webp'] as const) {
          const url = variantUrl(src, width, format)!;
          if (!existsSync(onDisk(url))) missing.push(url);
        }
      }
    }
    expect(missing, `missing variant files:\n${missing.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it.runIf(generated)('avif is smaller than webp at the same width, on average', async () => {
    // Not asserted per-file: AVIF loses to WebP on some small, flat, low-detail
    // images, and a per-file assertion would fail on a legitimately unlucky one.
    // The aggregate is what the delivery win is measured against — ~33% on the
    // art shipped as of 2026-08-11.
    const { statSync } = await import('node:fs');
    let avif = 0;
    let webp = 0;
    for (const [src, entry] of entries) {
      for (const width of entry.widths) {
        avif += statSync(onDisk(variantUrl(src, width, 'avif')!)).size;
        webp += statSync(onDisk(variantUrl(src, width, 'webp')!)).size;
      }
    }
    expect(avif).toBeLessThan(webp);
  });
});
