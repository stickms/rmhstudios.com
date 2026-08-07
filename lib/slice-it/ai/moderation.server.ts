/**
 * Slice It — comment triage. Server-only. (Feature 11.)
 *
 * Song comments are the only place in the game where one player writes text
 * another player reads, and they had no moderation path at all: a comment went
 * from a textarea to every visitor's screen with nothing in between.
 *
 * ## What this deliberately does not do
 *
 * **It never blocks a comment.** `triageComment` returns a severity and the
 * caller records it; the comment posts either way. Two reasons, and the second
 * is the important one:
 *
 *  1. A model call in the write path means a comment box that hangs for two
 *     seconds, or fails to post when the provider is down.
 *  2. The false positives here land on exactly the wrong people. A rhythm-game
 *     comment section is people saying a chart is unfair, the timing is broken,
 *     the map is garbage — blunt criticism of *an artefact*, which is the
 *     single easiest thing for a moderation model to score as hostility. Auto-
 *     hiding those would silence the most useful feedback the library gets.
 *
 * So this is triage in the literal sense: it sorts a queue for a human. The
 * prompt says "blunt criticism of a chart is none" in as many words, and the
 * severity floor in {@link shouldFlag} is set well above the ambiguous middle.
 */

import { SLICE_IT_COMMENT_TRIAGE } from '@/lib/ai/prompts';
import { attempt } from './run.server';
import { commentTriageSchema, type CommentSeverity, type CommentTriage } from './types';

/** Longest comment sent to the model. The cap on the column is 2000. */
const MAX_TRIAGE_CHARS = 1_000;

/**
 * Triage one comment.
 *
 * Returns `null` when AI is unavailable or the comment is empty — the caller
 * stores no verdict, which reads as "not yet triaged" rather than "clean".
 * Those must not be the same state: a queue that cannot tell them apart quietly
 * treats an outage as a clean bill of health for everything posted during it.
 */
export async function triageComment(
  content: string,
  opts: { userId?: string | null } = {},
): Promise<CommentTriage | null> {
  const trimmed = content.trim();
  if (!trimmed) return null;

  return attempt(
    SLICE_IT_COMMENT_TRIAGE,
    commentTriageSchema,
    trimmed.slice(0, MAX_TRIAGE_CHARS),
    opts,
  );
}

/**
 * Whether a triaged comment is worth a moderator's attention.
 *
 * `high` and above only. `medium` is where the ambiguous cases pile up — and in
 * this comment section the ambiguous cases are overwhelmingly people being rude
 * about a beatmap, which is not a moderation problem. A queue that fills with
 * those is a queue nobody reads, which costs more than the flag was worth.
 */
export function shouldFlag(triage: CommentTriage | null): boolean {
  if (!triage) return false;
  return triage.severity === 'high' || triage.severity === 'critical';
}

/** Ordering for a moderation queue, most severe first. */
export const SEVERITY_RANK: Record<CommentSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};
