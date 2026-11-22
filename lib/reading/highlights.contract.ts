/**
 * Contracts for the highlights notebook (search and export). Client-safe: types
 * come from the zod schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { MyHighlightsPage } from '@/lib/reading/schema';
import type { highlightsExportBody, highlightsSearchQuery } from '@/lib/reading/highlights-search-schema';

export interface HighlightsSearchPage extends MyHighlightsPage {
  /** How many highlights match the filter, across every page. */
  total: number;
}

export const searchHighlightsApi = endpoint<{
  query: z.infer<typeof highlightsSearchQuery>;
  res: HighlightsSearchPage;
}>()({
  method: 'GET',
  path: '/api/reading/highlights/search',
});

/** Answers with the file itself (`Content-Disposition: attachment`), not JSON: fetch it with `fetch(apiUrl(...))`. */
export const exportHighlightsApi = endpoint<{
  body: z.infer<typeof highlightsExportBody>;
  res: undefined;
}>()({
  method: 'POST',
  path: '/api/reading/highlights/export',
});
