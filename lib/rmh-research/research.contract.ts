/**
 * Contracts for RMH Research. The microsite's data is a checked-in catalogue
 * read directly by its pages, so the only endpoint is its link-preview card.
 */
import { endpoint } from '@/lib/contract/endpoint';

/** The kinds of research page that have a card of their own. */
export const RESEARCH_CARD_KINDS = ['paper', 'author', 'field'] as const;
export type ResearchCardKind = (typeof RESEARCH_CARD_KINDS)[number];

/**
 * The Open Graph card for a paper, an author or a field: a 1200x630 PNG named
 * in the page's `og:image` (`researchCardPath`).
 */
export const researchOgCardApi = endpoint<{
  res: never;
}>()({ method: 'GET', path: '/api/og/research/$kind/$id' });
