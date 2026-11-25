import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { decodeMine, mineSlugs, type MineChoice } from '../engine/mine';
import { pickFilter } from '../engine/saved-filters';
import { listsQuery, trackerQuery } from '../medschools.queries';

/**
 * "My schools" for one surface (owner 2026-11-24): the choice (the URL's, else this device's saved one; signed in
 * only), the private answers it needs and the slugs it names. The private reads are the existing `me/lists` and
 * `me/tracker` queries, never fetched signed out, and the tracker only while "My cycle" is chosen; the rail passes
 * `enabled` false below 1280px so a phone asks for nothing. The slugs never reach a public key as a user: the index
 * filters what it already has and the live feed sends them as the explicit `schools=` list.
 */
export function useMineFilter(
  /** The URL's choice; `null` is an explicit "All schools" (the rail's own pick this visit), `undefined` is silent. */
  url: MineChoice | null | undefined,
  saved: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  const { data: session } = useSession();
  const signedIn = !!session;
  const on = signedIn && (opts.enabled ?? true);
  const picked = pickFilter<MineChoice | null>(url, decodeMine(saved) ?? undefined, undefined, null);
  const choice = signedIn ? picked.value : null;
  const lists = useQuery({ ...listsQuery(), enabled: on });
  const tracker = useQuery({ ...trackerQuery(), enabled: on && choice?.kind === 'cycle' });
  const slugs = on ? mineSlugs(choice, tracker.data, lists.data) : null;
  return {
    signedIn,
    choice,
    /** `null`: no filter (none chosen, still loading, or a list that is gone); an empty set filters everything out. */
    slugs,
    lists: on ? lists.data : undefined,
    /** The choice came from this device and is in effect (the page says so in one line). */
    fromDevice: signedIn && picked.from === 'device' && slugs !== null,
  };
}
