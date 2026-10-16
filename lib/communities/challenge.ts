/**
 * N5 — weekly challenge rules (client-safe, pure).
 */

export const CHALLENGE_MIN_WINDOW_MS = 60 * 60 * 1000;
export const CHALLENGE_MAX_TOTAL_MS = 60 * 24 * 60 * 60 * 1000;

export type ChallengePhase = 'submit' | 'vote' | 'closed';

export interface ChallengeTimes {
  submitEndsAt: Date | string;
  voteEndsAt: Date | string;
}

const ms = (d: Date | string): number => (d instanceof Date ? d.getTime() : Date.parse(d));

/** Submissions until `submitEndsAt`, then voting until `voteEndsAt`, then closed. */
export function challengePhase(c: ChallengeTimes, now: number = Date.now()): ChallengePhase {
  if (now < ms(c.submitEndsAt)) return 'submit';
  if (now < ms(c.voteEndsAt)) return 'vote';
  return 'closed';
}

/** Returns an error message, or null when the windows are acceptable. */
export function validateChallengeWindows(
  submitEndsAt: Date | string,
  voteEndsAt: Date | string,
  now: number = Date.now(),
): string | null {
  const s = ms(submitEndsAt);
  const v = ms(voteEndsAt);
  if (!Number.isFinite(s) || !Number.isFinite(v)) return 'Invalid dates';
  if (s - now < CHALLENGE_MIN_WINDOW_MS) return 'The submission window must last at least an hour';
  if (v - s < CHALLENGE_MIN_WINDOW_MS) return 'The voting window must last at least an hour';
  if (v - now > CHALLENGE_MAX_TOTAL_MS) return 'A challenge can run for at most 60 days';
  return null;
}

export interface WinnerCandidate {
  id: string;
  voteCount: number;
  createdAt: Date | string;
}

/** Most votes wins; ties go to the earlier entry; no votes, no winner. */
export function pickWinner(entries: readonly WinnerCandidate[]): string | null {
  let best: WinnerCandidate | null = null;
  for (const e of entries) {
    if (e.voteCount <= 0) continue;
    if (
      !best ||
      e.voteCount > best.voteCount ||
      (e.voteCount === best.voteCount &&
        (ms(e.createdAt) < ms(best.createdAt) ||
          (ms(e.createdAt) === ms(best.createdAt) && e.id < best.id)))
    ) {
      best = e;
    }
  }
  return best?.id ?? null;
}
