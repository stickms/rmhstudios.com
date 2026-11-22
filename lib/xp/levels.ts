/**
 * Account level math. Level N is reached at 100·N² lifetime XP, so each level
 * costs a bit more than the last (level 1 = 100xp, 10 = 10k, 25 = 62.5k, 50 = 250k).
 */

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 0;
  return Math.floor(Math.sqrt(xp / 100));
}

export function xpForLevel(level: number): number {
  return 100 * level * level;
}

export interface LevelInfo {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1 toward next level
}

export function levelInfo(xp: number): LevelInfo {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = next - base;
  const into = xp - base;
  return {
    level,
    xp,
    xpIntoLevel: into,
    xpForNextLevel: span,
    progress: span > 0 ? into / span : 0,
  };
}
