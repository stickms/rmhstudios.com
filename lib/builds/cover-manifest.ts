/**
 * Build store-cover manifest (client-safe).
 *
 * `scripts/generate-build-covers.ts` generates wide promotional key-art for
 * each curated build via xAI, uploads it to the CDN as WebP, and records the
 * public URL here keyed by `"<buildId>:<ratio>"`. The storefront reads this
 * manifest so it only points at a wide cover that actually exists — no
 * speculative requests that 404 until the covers are generated.
 *
 * Pure data + lookups; safe to import on both server and client. The
 * server-side generator lives in `cover.server.ts`.
 */

import manifest from '@/data/build-covers.json';

/** Aspect ratios we generate. `wide` (16:9) is the default landscape cover. */
export const BUILD_COVER_RATIOS = ['wide', 'ultrawide'] as const;
export type BuildCoverRatio = (typeof BUILD_COVER_RATIOS)[number];

const COVERS = manifest as Record<string, string>;

function coverManifestKey(id: string, ratio: BuildCoverRatio): string {
  return `${id}:${ratio}`;
}

/** The CDN URL of a generated cover for this build + ratio, or undefined. */
export function getBuildCoverUrl(id: string, ratio: BuildCoverRatio = 'wide'): string | undefined {
  return COVERS[coverManifestKey(id, ratio)];
}
