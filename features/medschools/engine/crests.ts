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

const SKIP = new Set(['the', 'of', 'at', 'and', 'for']);

/**
 * Up to two capitals from the significant words of a school name ("Harvard Medical School" is "HM"), drawn in a
 * crest's place by `ui/SchoolCrest.tsx` and the link-preview card.
 */
export function crestInitials(name: string): string {
  return name
    .split(/[\s\-–,()]+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !SKIP.has(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
