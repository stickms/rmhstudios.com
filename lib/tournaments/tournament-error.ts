import type { ErrorCode } from '@/lib/errors/codes';

/** Tournament failures with a code and HTTP status. Its own module so seeding.server and tournament.server need not import each other. */
export class TournamentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
    /** Numbers the client words itself (a refused start reports `checkedIn` and `needed`). */
    public readonly details?: Record<string, number>,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}

/**
 * s10-20 — the taxonomy code for each refusal message a tournament route sends. The body's own `code`
 * (`FULL`, `CLOSED`, …) is a different layer's contract and stays; the taxonomy code rides in `refusal`, which
 * `readRefusal` (`lib/errors/refusal.ts`) reads so the client can render the message in the reader's language.
 * A message not listed here has no code and reads as the server's English.
 */
export const REFUSAL_BY_MESSAGE: Record<string, ErrorCode> = {
  'Tournament not found': 'TOURNAMENT_NOT_FOUND',
  'Match not found': 'TOURNAMENT_MATCH_NOT_FOUND',
  'Not your match': 'TOURNAMENT_NOT_YOUR_MATCH',
  'Only the two players can do this': 'TOURNAMENT_ONLY_PLAYERS',
  'Only the host can do this': 'TOURNAMENT_HOST_ONLY',
  'Tournament is not live': 'TOURNAMENT_NOT_LIVE',
  'Match is not ready': 'TOURNAMENT_MATCH_NOT_READY',
  'Tournament is full': 'TOURNAMENT_FULL',
  'This tournament has no check-in': 'TOURNAMENT_NO_CHECKIN',
  'This result was already answered': 'TOURNAMENT_RESULT_ANSWERED',
  'This result was already settled': 'TOURNAMENT_RESULT_SETTLED',
  'This result is disputed; the host decides it': 'TOURNAMENT_RESULT_DISPUTED',
  'Registration is closed': 'TOURNAMENT_REGISTRATION_CLOSED',
  'Check-in is closed': 'TOURNAMENT_CHECKIN_CLOSED',
  'Check-in has not opened yet': 'TOURNAMENT_CHECKIN_NOT_OPEN',
  'You are not registered': 'TOURNAMENT_NOT_REGISTERED',
  'Already registered': 'TOURNAMENT_ALREADY_REGISTERED',
  'Seeding is locked once the tournament starts': 'TOURNAMENT_SEEDING_LOCKED',
  'Cannot withdraw after start': 'TOURNAMENT_WITHDRAW_AFTER_START',
  'Already started': 'TOURNAMENT_ALREADY_STARTED',
  'Not enough players to start': 'TOURNAMENT_TOO_FEW',
  'Not enough coins for the entry fee': 'TOURNAMENT_ENTRY_FEE_COINS',
  'This tournament is over': 'TOURNAMENT_OVER',
  'Your account is restricted': 'TOURNAMENT_ACCOUNT_RESTRICTED',
  'There is no result to confirm': 'TOURNAMENT_NO_RESULT_TO_CONFIRM',
  'There is no result to dispute': 'TOURNAMENT_NO_RESULT_TO_DISPUTE',
  'There is no result to withdraw': 'TOURNAMENT_NO_RESULT_TO_WITHDRAW',
  'You cannot confirm your own report': 'TOURNAMENT_OWN_REPORT_CONFIRM',
  'You cannot dispute your own report': 'TOURNAMENT_OWN_REPORT_DISPUTE',
  'The proposed time has passed': 'TOURNAMENT_PROPOSAL_EXPIRED',
  'The proposal changed': 'TOURNAMENT_PROPOSAL_CHANGED',
  'Winner must be in this match': 'TOURNAMENT_BAD_WINNER',
};

/** `{ refusal }` for a tournament error whose message is in the taxonomy, else nothing; spread it into the body. */
export function tournamentRefusal(error: { message: string }): { refusal?: ErrorCode } {
  const code = REFUSAL_BY_MESSAGE[error.message];
  return code ? { refusal: code } : {};
}
