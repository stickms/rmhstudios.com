/**
 * The /library "Continue reading" row as a React Query (redesign audit B4: data a
 * component reads is a query, not an effect). Client-safe: contracts only.
 */
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/contract/client';
import { continueReadingApi } from '@/lib/library/reader-sync.contract';

export const continueReadingQuery = () =>
  queryOptions({
    queryKey: ['library', 'continue-reading'] as const,
    queryFn: ({ signal }) => api(continueReadingApi, { signal }),
    staleTime: 30_000,
  });
