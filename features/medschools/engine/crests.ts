/**
 * School crest lookup (client-safe). The manifest lists the slugs that have a committed WebP under
 * `public/images/medschools/crests/`; it is written by `scripts/medschools/fetch-admit-crests.ts`. Only the school UI
 * (the lazy page chunk) imports this module, so the slug list never reaches the entry bundle.
 */
import manifest from '../../../data/medschools/crests.json';

export const CREST_DIR = '/images/medschools/crests';

const known: ReadonlySet<string> = new Set(manifest.slugs);

/** The crest image path for a registry slug, or null when there is none. */
export function crestSrc(slug: string): string | null {
  return known.has(slug) ? `${CREST_DIR}/${slug}.webp` : null;
}
