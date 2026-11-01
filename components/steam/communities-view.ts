/** The fields of a community the Steam directory shows (a subset of `CommunityListItem`). */
export interface SteamCommunity {
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  memberCount: number;
  isPrivate: boolean;
  /** A private community the viewer is not in: shown, but not opened. */
  locked: boolean;
}

/** Communities whose name or description contains `q`, in their given order. */
export function filterCommunities<T extends SteamCommunity>(list: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return list;
  return list.filter(
    (c) => c.name.toLowerCase().includes(needle) || (c.description ?? '').toLowerCase().includes(needle),
  );
}
