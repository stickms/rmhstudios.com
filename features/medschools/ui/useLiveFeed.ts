import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useArrivingKeys } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { mergeLiveHead } from '../engine/public-read';
import { getMedLiveApi, type LiveEventDto } from '../medschools.contract';
import { liveQuery, type LiveFilters } from '../medschools.queries';

/**
 * The live feed for one filter set, shared by the live page and the activity rail: the newest page refetched every
 * 60 s and merged by id (rows already shown, and their fade, stay put), plus older pages appended on request. Key the
 * component that calls it by the filters, so a new filter set starts with its own rows.
 */
export function useLiveFeed(filters: LiveFilters, opts: { enabled?: boolean } = {}) {
  const query = useQuery({
    ...liveQuery(filters),
    enabled: opts.enabled ?? true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const data = query.data;

  // Head: the newest page, which every refetch merges into by id.
  const [head, setHead] = useState<LiveEventDto[]>(() => data?.events ?? []);
  const [seen, setSeen] = useState(data?.events);
  // Tail: older pages appended after the head. `cursor` undefined means the head's own nextCursor applies.
  const [tail, setTail] = useState<{ rows: LiveEventDto[]; cursor: string | null | undefined }>({
    rows: [],
    cursor: undefined,
  });
  if (data && data.events !== seen) {
    setSeen(data.events);
    const merged = mergeLiveHead(head, data.events);
    setHead(merged.rows);
    // More new events than a page arrived since the last refetch: the old head and older pages are no longer
    // contiguous with the new head, so start over from the fresh head and its own next cursor.
    if (merged.gap) setTail({ rows: [], cursor: undefined });
  }
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const cursor = tail.cursor !== undefined ? tail.cursor : (data?.nextCursor ?? null);

  const headIds = new Set(head.map((r) => r.id));
  const rows = [...head, ...tail.rows.filter((r) => !headIds.has(r.id))];
  const arriving = useArrivingKeys(rows.map((r) => r.id));

  const showOlder = async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderFailed(false);
    try {
      const page = await api(getMedLiveApi, { query: { ...filters, cursor } });
      setTail((prev) => ({ rows: [...prev.rows, ...page.events], cursor: page.nextCursor }));
    } catch {
      setOlderFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  return { query, data, rows, arriving, cursor, loadingOlder, olderFailed, showOlder };
}
