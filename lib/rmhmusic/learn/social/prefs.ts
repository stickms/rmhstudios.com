/**
 * A learner's social consent (RMH Music Phase 6, plan 1.1) — pure, client-safe.
 *
 * Two switches, both off by default, stored in `MusicSocial` (one row per learner; no row = both
 * off). They are read at query time, so a switch turned on puts the learner's already-scored runs
 * on the board, and turned off removes every past and present appearance at once. Turning a switch
 * off never deletes a result.
 *
 * - **board:** "Show my Daily challenge scores on the board" (audience: any signed-in learner;
 *   shows display name, avatar, score, mean time a prompt and whether chords were skipped).
 * - **friends:** "Share my progress with friends" (audience: mutual follows only). It also puts the
 *   learner's Daily score on the board's Friends tab, and a learner sees friends only while their
 *   own friends switch is on (no one-sided watching).
 */

export interface MusicSocialPrefs {
  board: boolean;
  friends: boolean;
}

export const DEFAULT_SOCIAL: Readonly<MusicSocialPrefs> = {
  board: false,
  friends: false,
};

/** The switches from a stored row (or none). */
export function readSocial(row: MusicSocialPrefs | null | undefined): MusicSocialPrefs {
  return row
    ? {
        board: row.board,
        friends: row.friends,
      }
    : {
        ...DEFAULT_SOCIAL,
      };
}
