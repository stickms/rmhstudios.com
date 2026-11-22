import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiQuery } from '@/lib/contract/client';
import { mentionSearchApi } from '@/lib/feed/feed-reads.contract';

/** A member as the mention search returns them. */
export interface MemberSuggestion {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

/**
 * Member search for an invite field (event co-hosts, jam teammates): the text is debounced 150 ms and searched
 * through React Query (so repeated terms are cached and a stale answer never overwrites a newer one), and the
 * previous suggestions stay up while the next term loads. A leading `@` is ignored; `excludeIds` are left out.
 * `dismiss()` hides the suggestions for the current text (Escape) until it changes.
 */
export function useMemberSearch(
  query: string,
  excludeIds: readonly string[],
): { term: string; results: MemberSuggestion[]; dismiss: () => void } {
  const term = query.trim().replace(/^@/, '');
  const [debounced, setDebounced] = useState(term);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 150);
    return () => clearTimeout(timer);
  }, [term]);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const search = useQuery({
    ...apiQuery(mentionSearchApi, { query: { q: debounced } }),
    enabled: debounced.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
  });
  const results: MemberSuggestion[] =
    term.length > 0 && dismissedFor !== term && !search.isError
      ? (search.data?.users ?? []).filter((u) => !excludeIds.includes(u.id))
      : [];
  return { term, results, dismiss: () => setDismissedFor(term) };
}
