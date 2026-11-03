import { useQuery } from '@tanstack/react-query';
import type { FeaturedStream } from '@/lib/elections/streams';

/** Featured + auto-discovered live streams (`/api/elections/streams`), shared by the watch panel and room panes. */
export function useLiveStreams(): FeaturedStream[] {
  const { data } = useQuery<{ streams: FeaturedStream[] }>({
    queryKey: ['elections-streams'],
    queryFn: async () => {
      const r = await fetch('/api/elections/streams');
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    staleTime: 3 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
  return data?.streams ?? [];
}
