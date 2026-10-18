import { z } from 'zod';

/**
 * X3 — bridging rule for context notes.
 *
 * A note is shown only when raters who usually DISAGREE both found it helpful.
 * "Usually disagree" comes from each rater's agreement vector: their helpful /
 * not-helpful ratings on every OTHER note. Two raters disagree when, over at
 * least MIN_OVERLAP notes they both rated, they gave the same answer less than
 * DISAGREE_BELOW of the time.
 */
export const MIN_HELPFUL = 3;
export const MIN_HELPFUL_RATIO = 0.7;
export const MIN_OVERLAP = 3;
export const DISAGREE_BELOW = 0.4;
/** A rater with fewer ratings elsewhere has no history to prove they disagree with anyone. */
export const MIN_HISTORY = 5;

export const noteBodySchema = z.object({
  postId: z.string().min(1).max(40),
  body: z.string().trim().min(10).max(500),
});
export const rateNoteSchema = z.object({ helpful: z.boolean() });

/** raterId -> (noteId -> helpful) on every note except the one being evaluated. */
export type RaterHistory = Map<string, Map<string, boolean>>;

export function pairAgreement(
  a: Map<string, boolean>,
  b: Map<string, boolean>,
): { overlap: number; agreement: number } {
  let overlap = 0;
  let same = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [noteId, v] of small) {
    const w = large.get(noteId);
    if (w === undefined) continue;
    overlap++;
    if (v === w) same++;
  }
  return { overlap, agreement: overlap ? same / overlap : 1 };
}

export function shouldShowNote(input: {
  helpfulRaters: string[];
  notHelpfulCount: number;
  history: RaterHistory;
}): boolean {
  const { helpfulRaters, notHelpfulCount, history } = input;
  const helpful = helpfulRaters.length;
  if (helpful < MIN_HELPFUL) return false;
  if (helpful / (helpful + notHelpfulCount) < MIN_HELPFUL_RATIO) return false;
  const eligible = helpfulRaters.filter((r) => (history.get(r)?.size ?? 0) >= MIN_HISTORY);
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const { overlap, agreement } = pairAgreement(
        history.get(eligible[i])!,
        history.get(eligible[j])!,
      );
      if (overlap >= MIN_OVERLAP && agreement < DISAGREE_BELOW) return true;
    }
  }
  return false;
}
