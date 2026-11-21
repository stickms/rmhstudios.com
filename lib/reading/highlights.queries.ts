/**
 * One page of the highlights notebook's server-side search (redesign audit B4: the
 * component owns UI state; data access lives here). Client-safe: contract only.
 */
import { api } from '@/lib/contract/client';
import { searchHighlightsApi } from '@/lib/reading/highlights.contract';
import type { HighlightsFilter } from '@/lib/reading/highlights-search-schema';

export function searchHighlightsPage(filter: HighlightsFilter, cursor: string | null, signal?: AbortSignal) {
  return api(searchHighlightsApi, {
    query: {
      ...(filter.q ? { q: filter.q } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.hasNote ? { hasNote: 'true' as const } : {}),
      ...(filter.visibility ? { visibility: filter.visibility } : {}),
      ...(filter.sort ? { sort: filter.sort } : {}),
      ...(cursor ? { cursor } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}
