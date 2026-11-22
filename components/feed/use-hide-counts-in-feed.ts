import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/Providers';
import { quietCountsQuery } from '@/lib/feed/quiet-counts.queries';

/**
 * The signed-in viewer's "Hide counts while browsing" switch (sprint 04 #14). Signed out, or before the setting has
 * loaded, numbers are shown: the switch is a preference about what to see, not a privacy rule (that one is the
 * author's, and the server enforces it).
 */
export function useHideCountsInFeed(): boolean {
  const { data: session } = useSession();
  const { data } = useQuery({ ...quietCountsQuery(), enabled: !!session });
  return !!session && data?.hideCountsInFeed === true;
}
