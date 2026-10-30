/**
 * Which achievements belong on which title's library page. Achievement
 * definitions carry a display-name `group` ("Slice It!"), not a catalog id, so
 * the join is this table. `lib/games/__tests__/achievement-groups.test.ts`
 * fails when a catalog group is in neither list.
 */

/** Catalog title id -> the achievement catalog `group` label. */
export const ACHIEVEMENT_GROUP_BY_GAME_ID: Record<string, string> = {
  altair: 'Altair',
  'bums-rush': "Bum's Rush",
  'daily-puzzles': 'Daily Puzzles',
  rmhbox: 'RMHBox',
  rmhmusic: 'RMHMusic',
  rmhstudy: 'RMHStudy',
  rmhtube: 'RMHTube',
  rmhtype: 'RMHType',
  'slice-it': 'Slice It!',
  'synapse-storm': 'Synapse Storm',
  'temple-of-joy': 'Temple of Joy',
};

/**
 * Groups with no catalog title to hang on (the casino is not a catalog entry).
 * One-directional: delete an entry when its group gains a title.
 */
export const UNMAPPED_ACHIEVEMENT_GROUPS: string[] = ['Casino'];

/** The achievements for one title; empty when the title has none. */
export function achievementsForTitle<T extends { group: string | null }>(
  gameId: string,
  defs: T[],
): T[] {
  const label = ACHIEVEMENT_GROUP_BY_GAME_ID[gameId];
  return label ? defs.filter((d) => d.group === label) : [];
}
