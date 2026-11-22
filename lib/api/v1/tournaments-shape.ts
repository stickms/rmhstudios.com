/**
 * The v1 shapes of a tournament, a bracket match and a refusal, as pure functions over plain rows.
 * Players are public handle and display name only (never an e-mail, a coin balance or a rating); a
 * claim's free-text dispute note is never returned. Kept free of server imports so the serialisers
 * are testable on their own (`v1-tournaments.product.test.ts`).
 */
import { getWagerGame } from '@/lib/wager/eligible-games';
import { checkInOpensAt } from '@/lib/tournaments/checkin';
import { CLAIM_WINDOW_MS } from '@/lib/tournaments/match-results';
import { resolveUser } from '@/lib/user-display';

export interface ApiPlayer {
  handle: string;
  name: string;
}

export interface ApiTournament {
  id: string;
  name: string;
  gameId: string;
  gameTitle: string | null;
  format: string;
  status: string;
  entryFeeCoins: number;
  prizePoolCoins: number;
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  swissRounds: number | null;
  seeding: string;
  startsAt: string | null;
  checkInMinutes: number | null;
  checkInOpensAt: string | null;
  matchDeadlineHours: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  host: ApiPlayer;
}

export interface ApiTournamentDetail extends ApiTournament {
  /** Whether the key owner is in the field, and whether they have checked in. */
  you: {
    entered: boolean;
    checkedIn: boolean;
  };
}

export interface ApiSide {
  entrantId: string;
  seed: number | null;
  handle: string;
  name: string;
}

export interface ApiClaim {
  /** `open`: reported and awaiting the opponent; `disputed`: the host decides. */
  state: 'open' | 'disputed';
  /** Detail below is for the two players and the host; everyone else sees it as null. */
  winnerEntrantId: string | null;
  claimedByEntrantId: string | null;
  claimedAt: string | null;
  /** When the opponent's window to answer ends (`claimedAt` + 15 minutes). */
  answerBy: string | null;
}

export interface ApiMatch {
  id: string;
  round: number;
  slot: number;
  /** W winners, L losers, GF grand final, GR bracket reset (W for other formats). */
  bracket: string;
  state: string;
  playerA: ApiSide | null;
  playerB: ApiSide | null;
  winnerEntrantId: string | null;
  resultSource: string | null;
  scheduledAt: string | null;
  deadlineAt: string | null;
  claim: ApiClaim | null;
}

export interface ApiEntry {
  entrantId: string;
  seed: number | null;
  placement: number | null;
  checkedIn: boolean;
  wins: number;
  losses: number;
}

export interface ApiMyTournament {
  tournament: ApiTournament;
  entry: ApiEntry;
  nextMatch: ApiMatch | null;
}

type UserRow = Parameters<typeof resolveUser>[0];

export interface TournamentRow {
  id: string;
  name: string;
  gameId: string;
  format: string;
  status: string;
  entryFeeCoins: number;
  prizePoolCoins: number;
  minPlayers: number;
  maxPlayers: number;
  swissRounds: number | null;
  seeding: string;
  startsAt: Date | null;
  checkInMinutes: number | null;
  matchDeadlineHours: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  createdBy?: UserRow | null;
  _count: {
    entrants: number;
  };
}

export function toPlayer(user: UserRow | null | undefined): ApiPlayer | null {
  if (!user) return null;
  const r = resolveUser(user);
  const handle = r.handle ?? r.username ?? '';
  return {
    handle,
    name: r.name ?? handle,
  };
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function serializeTournament(t: TournamentRow): ApiTournament {
  return {
    id: t.id,
    name: t.name,
    gameId: t.gameId,
    gameTitle: getWagerGame(t.gameId)?.title ?? null,
    format: t.format,
    status: t.status,
    entryFeeCoins: t.entryFeeCoins,
    prizePoolCoins: t.prizePoolCoins,
    minPlayers: t.minPlayers,
    maxPlayers: t.maxPlayers,
    playerCount: t._count.entrants,
    swissRounds: t.swissRounds,
    seeding: t.seeding,
    startsAt: iso(t.startsAt),
    checkInMinutes: t.checkInMinutes,
    checkInOpensAt: iso(
      checkInOpensAt({
        startsAt: t.startsAt,
        checkInMinutes: t.checkInMinutes,
      }),
    ),
    matchDeadlineHours: t.matchDeadlineHours,
    startedAt: iso(t.startedAt),
    completedAt: iso(t.completedAt),
    createdAt: t.createdAt.toISOString(),
    host: toPlayer(t.createdBy) ?? {
      handle: '',
      name: '',
    },
  };
}

export interface EntrantRow {
  id: string;
  userId: string;
  seed: number | null;
  user?: UserRow | null;
}

export interface MatchRow {
  id: string;
  round: number;
  slot: number;
  bracket: string;
  state: string;
  winnerEntrantId: string | null;
  resultSource: string | null;
  scheduledAt: Date | null;
  deadlineAt: Date | null;
  claimedWinnerId: string | null;
  claimedById: string | null;
  claimedAt: Date | null;
  disputedAt: Date | null;
  entrantA: EntrantRow | null;
  entrantB: EntrantRow | null;
}

function side(e: EntrantRow | null): ApiSide | null {
  if (!e) return null;
  const p = toPlayer(e.user);
  return {
    entrantId: e.id,
    seed: e.seed,
    handle: p?.handle ?? '',
    name: p?.name ?? '',
  };
}

/**
 * One bracket match. A claim's state is public (a disputed match reads "disputed" to everyone, as on
 * the site); its detail (who reported whom, when) is for the two players and the host only. The
 * dispute note is never returned.
 */
export function serializeMatch(
  m: MatchRow,
  viewer: {
    userId: string;
    hostId: string;
  },
): ApiMatch {
  const privileged =
    viewer.userId === viewer.hostId || m.entrantA?.userId === viewer.userId || m.entrantB?.userId === viewer.userId;
  let claim: ApiClaim | null = null;
  if (m.state !== 'COMPLETE' && m.state !== 'CANCELLED') {
    if (m.disputedAt) {
      claim = {
        state: 'disputed',
        winnerEntrantId: privileged ? m.claimedWinnerId : null,
        claimedByEntrantId: privileged ? claimantEntrant(m) : null,
        claimedAt: privileged ? iso(m.claimedAt) : null,
        answerBy: null,
      };
    } else if (m.claimedAt) {
      claim = {
        state: 'open',
        winnerEntrantId: privileged ? m.claimedWinnerId : null,
        claimedByEntrantId: privileged ? claimantEntrant(m) : null,
        claimedAt: privileged ? m.claimedAt.toISOString() : null,
        answerBy: privileged ? new Date(m.claimedAt.getTime() + CLAIM_WINDOW_MS).toISOString() : null,
      };
    }
  }
  return {
    id: m.id,
    round: m.round,
    slot: m.slot,
    bracket: m.bracket,
    state: m.state,
    playerA: side(m.entrantA),
    playerB: side(m.entrantB),
    winnerEntrantId: m.winnerEntrantId,
    resultSource: m.resultSource,
    scheduledAt: iso(m.scheduledAt),
    deadlineAt: iso(m.deadlineAt),
    claim,
  };
}

/** The entrant (not the user) who made the claim; null when the claimant was erased. */
function claimantEntrant(m: MatchRow): string | null {
  if (!m.claimedById) return null;
  if (m.entrantA?.userId === m.claimedById) return m.entrantA.id;
  if (m.entrantB?.userId === m.claimedById) return m.entrantB.id;
  return null;
}

export const CONFIRM_ON_SITE_MESSAGE = 'Confirm this result on the site: it decides the prizes.';

export interface Refusal {
  code: string;
  status: number;
  message: string;
}

/** Fixed, English text per refusal code of the existing functions; their own messages are never echoed. */
const MESSAGES: Record<string, string> = {
  NOT_FOUND: 'Not found.',
  FORBIDDEN: 'You cannot do this.',
  CLOSED: 'Check-in is closed.',
  NO_CHECKIN: 'This tournament has no check-in.',
  NOT_OPEN: 'Check-in has not opened yet.',
  NOT_ENTERED: 'You are not registered in this tournament.',
  MATCH_CANCELLED: 'This match was cancelled with its tournament.',
  NOT_LIVE: 'The tournament is not live.',
  NOT_READY: 'The match is not ready.',
  DISPUTED: 'This result is disputed; the host decides it on the site.',
  NO_CLAIM: 'There is no reported result.',
  OWN_CLAIM: 'You cannot confirm your own report.',
  CLAIM_GONE: 'This result was already answered.',
  BAD_WINNER: 'The winner must be a player in this match.',
};

/** A refusal of `checkIn`, `claimResult`, `confirmResult` or `withdrawClaim` as the v1 error envelope. */
export function refusalOf(e: { code: string; status: number }): Refusal {
  if (e.code === 'CONFIRM_ON_SITE')
    return {
      code: 'confirm_on_site',
      status: 409,
      message: CONFIRM_ON_SITE_MESSAGE,
    };
  const message = MESSAGES[e.code];
  if (e.status === 404)
    return {
      code: 'not_found',
      status: 404,
      message: message ?? 'Not found.',
    };
  if (e.status === 403)
    return {
      code: 'forbidden',
      status: 403,
      message: message ?? 'Forbidden.',
    };
  if (e.status === 400) {
    return {
      code: 'invalid_request',
      status: 400,
      message: message ?? 'Invalid request.',
    };
  }
  return {
    code: 'conflict',
    status: 409,
    message: message ?? 'This cannot be done now.',
  };
}
