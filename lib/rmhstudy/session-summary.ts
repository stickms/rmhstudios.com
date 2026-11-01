/**
 * Summary of a flashcard review session. Grades are the same 0-3 the review
 * endpoint takes: 0 Again, 1 Hard, 2 Good, 3 Easy.
 */

export interface SessionSummary {
  /** Count of each grade, indexed 0-3. */
  counts: [number, number, number, number];
  total: number;
  /** Whole-number percentage of cards graded Good or Easy; 0 for an empty session. */
  recalledPercent: number;
}

export function summarizeGrades(grades: number[]): SessionSummary {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const g of grades) {
    if (Number.isInteger(g) && g >= 0 && g <= 3) counts[g]!++;
  }
  const total = counts[0] + counts[1] + counts[2] + counts[3];
  const recalled = counts[2] + counts[3];
  return { counts, total, recalledPercent: total === 0 ? 0 : Math.round((recalled / total) * 100) };
}
