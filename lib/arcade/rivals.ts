export type RivalState = 'ahead' | 'behind';

/**
 * 'ahead' = the rival sits above the player; 'behind' = the player passed them.
 * A notification is only worth sending when a rival the player had passed takes
 * the spot back.
 */
export function nextRivalState(
  state: RivalState,
  mine: number,
  rival: number,
  lowerIsBetter: boolean,
): { state: RivalState; notify: boolean } {
  const better = (a: number, b: number) => (lowerIsBetter ? a < b : a > b);
  if (state === 'ahead') return { state: better(mine, rival) ? 'behind' : 'ahead', notify: false };
  return better(rival, mine)
    ? { state: 'ahead', notify: true }
    : { state: 'behind', notify: false };
}
