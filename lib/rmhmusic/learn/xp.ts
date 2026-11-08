/** XP paid per star newly earned on a lesson. */
const XP_PER_STAR = 10;

/**
 * XP for finishing a lesson: 10 per star gained over what the learner already
 * held. A replay, or a worse result, earns nothing.
 */
export function xpForCompletion(prevStars: number, nextStars: number): number {
  return XP_PER_STAR * Math.max(0, nextStars - prevStars);
}

export interface StoredResult {
  stars: number;
  bestScore: number;
}

export interface MergedResult extends StoredResult {
  xpAwarded: number;
}

/**
 * Fold a new attempt into what is stored. Stars and best score only ever go
 * up, and XP is paid on the stars gained, so replaying a lesson cannot farm it.
 */
export function mergeLessonResult(
  prev: StoredResult | null,
  next: { stars: number; score: number },
): MergedResult {
  const prevStars = prev?.stars ?? 0;
  return {
    stars: Math.max(prevStars, next.stars),
    bestScore: Math.max(prev?.bestScore ?? 0, next.score),
    xpAwarded: xpForCompletion(prevStars, next.stars),
  };
}
