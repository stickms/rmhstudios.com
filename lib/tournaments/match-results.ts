/**
 * Confirm or dispute a tournament result (s06-20): the pure rules.
 *
 * A participant's report is a CLAIM. The opponent confirms it (the match settles
 * with source `agreement`), disputes it (the host decides) or lets it lapse (it
 * settles `unanswered` after {@link CLAIM_WINDOW_MS}, unless that would complete
 * the tournament). Nothing here touches the database; `match-results.server.ts`
 * applies these decisions under the match lock.
 */

/** How long an opponent has to answer a claim. Not per tournament in this feature. */
export const CLAIM_WINDOW_MINUTES = 15;
export const CLAIM_WINDOW_MS =
  CLAIM_WINDOW_MINUTES *
  60_000;
export const DISPUTE_NOTE_MAX = 300;

/** The `resultSource` values a settled match can carry (`admin` is the host's or an admin's report; `walkover` an award). */
export const RESULT_SOURCES =
  [
    'agreement',
    'admin',
    'authoritative',
    'unanswered',
    // s07-06: the host awarded an overdue match.
    'walkover',
  ] as const;
export type ResultSource =
  (typeof RESULT_SOURCES)[number];

export interface ClaimState {
  claimedWinnerId:
    | string
    | null;
  claimedById:
    | string
    | null;
  claimedAt: Date | null;
  disputedAt: Date | null;
}

export type MatchPhase =
  | 'open'
  | 'claimed'
  | 'disputed';

export function matchPhase(
  s: Pick<
    ClaimState,
    | 'claimedAt'
    | 'disputedAt'
  >,
): MatchPhase {
  if (
    s.disputedAt
  )
    return 'disputed';
  return s.claimedAt
    ? 'claimed'
    : 'open';
}

/** True once the window has run out (the boundary itself counts as expired). */
export function claimExpired(
  claimedAt: Date,
  now: Date,
): boolean {
  return (
    now.getTime() -
      claimedAt.getTime() >=
    CLAIM_WINDOW_MS
  );
}

/** The instant before which a claim is still open, for the job's query. */
export function claimCutoff(
  now: Date,
): Date {
  return new Date(
    now.getTime() -
      CLAIM_WINDOW_MS,
  );
}

/** Whole minutes left to answer, rounded up; 0 once the window has passed. Computed on render only (R5). */
export function claimMinutesLeft(
  claimedAt: Date,
  now: Date,
): number {
  const left =
    claimedAt.getTime() +
    CLAIM_WINDOW_MS -
    now.getTime();
  return left <=
    0
    ? 0
    : Math.ceil(
        left /
          60_000,
      );
}

export type ReportOutcome =
  /** No claim yet: record one. */
  | 'claim'
  /** The claimant reports again with another winner: replace the claim, restart the window. */
  | 'replace'
  /** The claimant repeats their own claim: nothing changes. */
  | 'unchanged'
  /** The opponent reports the claimed winner: that is a confirmation. */
  | 'confirm'
  /** The opponent reports the other winner: that is a dispute. */
  | 'dispute'
  /** Already disputed: the host decides, a participant cannot report. */
  | 'locked';

/** What a participant's report does to the match, given its current claim. */
export function reportOutcome(
  state: ClaimState,
  reporterId: string,
  winnerEntrantId: string,
): ReportOutcome {
  if (
    state.disputedAt
  )
    return 'locked';
  if (
    !state.claimedAt ||
    !state.claimedWinnerId
  )
    return 'claim';
  // An erased claimant (id nulled) has no side: whoever reports next answers the claim.
  if (
    state.claimedById ===
    reporterId
  ) {
    return state.claimedWinnerId ===
      winnerEntrantId
      ? 'unchanged'
      : 'replace';
  }
  return state.claimedWinnerId ===
    winnerEntrantId
    ? 'confirm'
    : 'dispute';
}

/** Only the other participant answers a claim; the claimant never answers their own. */
export function canAnswerClaim(
  state: ClaimState,
  userId: string,
  participantIds: string[],
): boolean {
  if (
    !state.claimedAt ||
    state.disputedAt
  )
    return false;
  if (
    !participantIds.includes(
      userId,
    )
  )
    return false;
  return (
    state.claimedById !==
    userId
  );
}

/** The claimant may withdraw until the claim is answered (disputed counts as answered). */
export function canWithdrawClaim(
  state: ClaimState,
  userId: string,
): boolean {
  return (
    !!state.claimedAt &&
    !state.disputedAt &&
    state.claimedById ===
      userId
  );
}

/** The host or an admin may decide a claim or a dispute. */
export function canDecide(
  isHost: boolean,
  isAdmin: boolean,
): boolean {
  return (
    isHost ||
    isAdmin
  );
}

export interface CompletionInput {
  format:
    | 'SINGLE_ELIM'
    | 'DOUBLE_ELIM'
    | 'ROUND_ROBIN'
    | 'SWISS';
  bracket: string;
  round: number;
  /** The winner of this match flows into another match. */
  hasNextMatch: boolean;
  swissRounds:
    | number
    | null;
  /** Matches other than this one still undecided: all of them (round robin) or this round's (Swiss). */
  otherOpenMatches: number;
}

/**
 * Whether settling this match would complete the tournament, which pays out
 * coins. The job never settles such a match on its own (the spec's rule):
 * the final of single elimination, the grand final or its reset in double
 * elimination (either winner, to stay on the safe side), the last undecided
 * match of a round robin, the last undecided match of Swiss's last round.
 */
export function wouldCompleteTournament(
  m: CompletionInput,
): boolean {
  switch (
    m.format
  ) {
    case 'SINGLE_ELIM':
      return !m.hasNextMatch;
    case 'DOUBLE_ELIM':
      return (
        m.bracket ===
          'GF' ||
        m.bracket ===
          'GR'
      );
    case 'ROUND_ROBIN':
      return (
        m.otherOpenMatches ===
        0
      );
    case 'SWISS':
      return (
        m.round >=
          (m.swissRounds ??
            1) &&
        m.otherOpenMatches ===
          0
      );
  }
}

/** Whether the job may settle this claim now. */
export function autoSettleDecision(
  state: ClaimState,
  completion: CompletionInput,
  now: Date,
):
  | 'settle'
  | 'wait'
  | 'skip' {
  if (
    !state.claimedAt ||
    !state.claimedWinnerId ||
    state.disputedAt
  )
    return 'skip';
  if (
    !claimExpired(
      state.claimedAt,
      now,
    )
  )
    return 'skip';
  return wouldCompleteTournament(
    completion,
  )
    ? 'wait'
    : 'settle';
}

/** The i18n key suffix a UI shows for how a match was settled; null for anything unknown. */
export function sourceKind(
  source:
    | string
    | null,
): ResultSource | null {
  return (
    RESULT_SOURCES as readonly string[]
  ).includes(
    source ??
      '',
  )
    ? (source as ResultSource)
    : null;
}
