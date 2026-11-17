/**
 * The sitemap entries for the RMH Research catalogue: every field, author and
 * paper page. Read by the `pages` section in `lib/sitemap.server.ts` (the
 * catalogue is checked-in data, like the game catalog, not the database). The
 * microsite's fixed pages come from `lib/verticals.ts`.
 */
import { AUTHORS, PAPERS } from './catalog';
import { FIELDS } from './fields';

export interface ResearchSitemapEntry {
  loc: string;
  changefreq: 'monthly' | 'yearly';
  priority: number;
}

export function researchSitemapRoutes(): ResearchSitemapEntry[] {
  return [
    ...FIELDS.map((f) => ({ loc: `/rmh-research/fields/${f.id}`, changefreq: 'monthly' as const, priority: 0.5 })),
    ...AUTHORS.map((a) => ({ loc: `/rmh-research/authors/${a.id}`, changefreq: 'monthly' as const, priority: 0.4 })),
    ...PAPERS.filter((p) => p.kind !== 'report').map((p) => ({
      loc: `/rmh-research/paper/${p.id}`,
      changefreq: 'yearly' as const,
      priority: 0.4,
    })),
  ];
}
