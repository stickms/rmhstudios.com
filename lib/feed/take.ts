/**
 * Take meter (feature idea X6) — client-safe shapes and arithmetic.
 *
 * A "take" is an RMHark its author marked as an opinion to be agreed or
 * disagreed with. Readers vote once; the split is hidden until they have voted
 * (so the crowd cannot anchor the answer), and always visible to the author.
 * The poll machinery in `poll-count.ts` is the model: a denormalized tally on
 * the post plus one vote row per member. Unlike a poll the tally is never part
 * of the feed payload — the feed carries only `isTake`, and the state below is
 * fetched on its own from `/api/rmharks/:id/take`.
 */

import { z } from 'zod';

export const takeVoteSchema = z.object({
  vote: z.enum(['agree', 'disagree']),
});
export type TakeVote = z.infer<typeof takeVoteSchema>['vote'];

export interface TakeCounts {
  agree: number;
  disagree: number;
}

/** What one viewer is allowed to know about a take. */
export interface TakeState {
  isTake: boolean;
  isAuthor: boolean;
  /** The viewer's own vote; null when they have not voted. */
  myVote: TakeVote | null;
  /**
   * The split. Present only for the author and for members who have voted —
   * for everyone else the server omits it entirely rather than sending it and
   * trusting the client to hide it.
   */
  counts: TakeCounts | null;
}

/** Whole-number percentages that always sum to 100 (or 0/0 with no votes). */
export function takeSplit(counts: TakeCounts): { agree: number; disagree: number; total: number } {
  const total = counts.agree + counts.disagree;
  if (total === 0) return { agree: 0, disagree: 0, total: 0 };
  const agree = Math.round((counts.agree / total) * 100);
  return { agree, disagree: 100 - agree, total };
}

/**
 * Build the state one viewer may see. The ONLY place the reveal rule lives:
 * the split is included for the author and for a member who has voted, and is
 * `null` for everyone else — the server never sends it to be hidden client-side.
 */
export function buildTakeState(
  post: { userId: string; isTake: boolean; takeAgreeCount: number; takeDisagreeCount: number },
  viewerId: string | null,
  myVote: TakeVote | null,
): TakeState {
  const isAuthor = viewerId !== null && viewerId === post.userId;
  const revealed = isAuthor || myVote !== null;
  return {
    isTake: post.isTake,
    isAuthor,
    myVote,
    counts: revealed ? { agree: post.takeAgreeCount, disagree: post.takeDisagreeCount } : null,
  };
}
