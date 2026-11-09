/**
 * Turns a result into the 0–100 score and 0–3 stars that `lessonComplete` stores — pure.
 * Stars reward accuracy only; nothing here knows about speed.
 */

export type Stars = 0 | 1 | 2 | 3;

export function starsFor(score: number): Stars {
  if (score >= 95) return 3;
  if (score >= 80) return 2;
  if (score >= 60) return 1;
  return 0;
}

/** Percent correct, rounded, 0..100; 0 when nothing was attempted. */
export function scoreFrom(correct: number, total: number): number {
  if (!(total > 0) || !(correct > 0)) return 0;
  return Math.min(100, Math.round((correct / total) * 100));
}
