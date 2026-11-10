/**
 * Contracts for the Slice It chart editor's reads and publishes (redesign audit
 * C1, batch 8). Client-safe: types only, by `import type`.
 *
 * The autosave PATCH stays a raw fetch: it needs `keepalive` to survive a page
 * unload, which `api()` does not expose.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { ChartDto, ChartRevisionDto } from '@features/slice-it/engine/editor/api-schemas';

/** Seed (or fetch) the author's charts for a song: one row per difficulty. */
export const seedChartsApi = endpoint<{
  body: { songId: string; keys: number };
  res: { charts: ChartDto[] };
}>()({ method: 'POST', path: '/api/slice-it/charts' });

/** Publish or un-publish one difficulty. 422 carries the blocking lint issues. */
export const publishChartApi = endpoint<{
  body: { status: 'public' | 'draft' };
  res: ChartDto;
}>()({ method: 'POST', path: '/api/slice-it/charts/$id' });

export const listChartRevisionsApi = endpoint<{ res: { revisions: ChartRevisionDto[] } }>()({
  method: 'GET',
  path: '/api/slice-it/charts/$id/revisions',
});
