/** Boss Rush unlock flag. Earned by clearing the final wave of a normal run. */
export const BOSS_RUSH_GAME_ID = 'void-breaker-boss-rush';
const KEY = 'vb-boss-rush-unlocked';

export function isBossRushUnlocked(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markBossRushUnlocked(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked */
  }
}
